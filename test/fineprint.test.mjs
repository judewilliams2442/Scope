import assert from "node:assert/strict";
import {
  afterEach,
  beforeEach,
  test,
} from "node:test";
import { handler } from "../netlify/functions/fineprint.mjs";

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const CATEGORIES_FOR_TEST = new Set([
  "location_tracking",
  "ai_training",
  "pii_collection",
  "third_party_sharing",
  "targeted_advertising",
  "retention_deletion",
]);
const POLICY = [
  "We collect account",
  "information.",
  "We do not use personal data to train AI models.",
  "We share data with service providers.",
  "We retain data for as long as needed.",
  "General policy terms apply. ".repeat(1_200),
].join("\n");
const SAVED_ENV = {};
let savedFetch;
let lastChatRequest;
let chatRequests;

function validAnalysis() {
  return {
    isPrivacyPolicy: true,
    deal: "The policy describes collecting account information and sharing it with providers.",
    deal_evidence: [{ quote: "We collect account information." }],
    ai_training: {
      answer: "no",
      quote: "We do not use personal data to train AI models.",
    },
    findings: [
      {
        category: "pii_collection",
        title: "Account information",
        explanation: "The policy says it collects account information.",
        status: "explicitly_stated",
        severity: "low",
        evidence: [{ quote: "We collect account information." }],
      },
      {
        category: "ai_training",
        title: "AI model training",
        explanation: "The policy explicitly rules out using personal data to train AI models.",
        status: "explicitly_stated",
        severity: "informational",
        evidence: [{ quote: "We do not use personal data to train AI models." }],
      },
      {
        category: "third_party_sharing",
        title: "Service providers",
        explanation: "The policy says data is shared with service providers.",
        status: "explicitly_stated",
        severity: "low",
        evidence: [{ quote: "We share data with service providers." }],
      },
      {
        category: "retention_deletion",
        title: "Retention period",
        explanation: "The policy says data is retained as long as needed.",
        status: "explicitly_stated",
        severity: "medium",
        evidence: [{ quote: "We retain data for as long as needed." }],
      },
    ],
    unknowns: [
      {
        category: "location_tracking",
        explanation: "The text does not establish whether location is tracked.",
      },
      {
        category: "targeted_advertising",
        explanation: "The text does not establish whether data is used for targeted advertising.",
      },
    ],
  };
}

function request(body, { method = "POST", origin = EXTENSION_ORIGIN } = {}) {
  const payload = { ...body };
  if (!Object.hasOwn(payload, "categories")) {
    payload.categories = [...CATEGORIES_FOR_TEST];
  }
  return new Request("https://scope.test/api/fineprint", {
    method,
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  });
}

function installMistral({
  modelStatus = 200,
  chatStatus = 200,
  completion,
  completionContent,
  finishReason = "stop",
} = {}) {
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.mistral.ai/v1/models") {
      return Response.json(
        modelStatus === 200
          ? { data: [{ id: "ministral-3b-latest", max_context_length: 32_000 }] }
          : { message: "private upstream detail" },
        { status: modelStatus }
      );
    }
    assert.equal(url, "https://api.mistral.ai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer test-key-not-a-secret");
    lastChatRequest = JSON.parse(options.body);
    chatRequests.push(lastChatRequest);
    if (chatStatus !== 200) {
      return Response.json(
        { error: { message: chatStatus === 400 ? "maximum context length exceeded" : "private upstream detail" } },
        { status: chatStatus }
      );
    }
    const content = completionContent ?? JSON.stringify(completion ?? validAnalysis());
    return Response.json({
      choices: [{
        finish_reason: finishReason,
        message: {
          content,
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    });
  };
}

beforeEach(() => {
  for (const name of ["MISTRAL_API_KEY", "MISTRAL_MODEL", "MISTRAL_CONTEXT_TOKENS", "SCOPE_ALLOWED_ORIGINS"]) {
    SAVED_ENV[name] = process.env[name];
  }
  process.env.MISTRAL_API_KEY = "test-key-not-a-secret";
  process.env.MISTRAL_MODEL = "ministral-3b-latest";
  delete process.env.MISTRAL_CONTEXT_TOKENS;
  process.env.SCOPE_ALLOWED_ORIGINS = EXTENSION_ORIGIN;
  savedFetch = globalThis.fetch;
  lastChatRequest = undefined;
  chatRequests = [];
  installMistral();
});

afterEach(() => {
  for (const [name, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = savedFetch;
});

test("analyzes the complete policy and returns compatible, quoted JSON", async () => {
  assert.ok(new TextEncoder().encode(POLICY).length > 30_000);
  const response = await handler(request({ policy: POLICY }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.equal(lastChatRequest.model, "ministral-3b-latest");
  assert.equal(lastChatRequest.max_tokens, 4096);
  assert.equal(chatRequests.length, 1);
  assert.match(
    lastChatRequest.messages[1].content,
    /Requested categories: .*location_tracking.*ai_training/
  );
  assert.ok(lastChatRequest.messages[1].content.endsWith(POLICY));
  assert.equal(lastChatRequest.messages[0].content.includes("one result"), true);
  assert.equal(result.ai_training.answer, "no");
  assert.equal(result.they_take.length, 1);
  assert.equal(result.who_gets_it.length, 1);
  assert.equal(result.red_flags.length, 1);
  assert.equal(result.findings.length, 4);
  assert.equal(
    result.findings.find(({ category }) => category === "pii_collection")
      .evidence[0].quote,
    "We collect account\ninformation."
  );
  for (const finding of result.findings) {
    for (const evidence of finding.evidence) {
      assert.ok(POLICY.includes(evidence.quote));
    }
  }
});

test("matches equivalent Unicode punctuation and returns the exact source quote", async () => {
  const policy = "We’re improving our services — for example, “searches.”";
  const modelQuote = "We're improving our services - for example, \"searches.\"";
  const analysis = validAnalysis();
  analysis.findings = [{
    category: "pii_collection",
    title: "Search activity",
    explanation: "The policy describes using search activity.",
    status: "explicitly_stated",
    severity: "informational",
    evidence: [{ quote: modelQuote }],
  }];
  installMistral({ completion: analysis });

  const response = await handler(request({
    policy,
    categories: ["pii_collection"],
  }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.findings[0].evidence[0].quote, policy);
});

test("sends only selected preferences and limits the response to those categories", async () => {
  const analysis = validAnalysis();
  installMistral({ completion: analysis });

  const response = await handler(request({
    policy: POLICY,
    categories: ["targeted_advertising"],
  }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(chatRequests.length, 1);
  assert.match(lastChatRequest.messages[1].content, /Requested categories: targeted_advertising/);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.unknowns.map(({ category }) => category), ["targeted_advertising"]);
});

test("supports older clients that do not send selected categories", async () => {
  const legacyRequest = new Request("https://scope.test/api/fineprint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: EXTENSION_ORIGIN,
    },
    body: JSON.stringify({ policy: POLICY }),
  });
  const response = await handler(legacyRequest);

  assert.equal(response.status, 200);
  assert.equal(chatRequests.length, 1);
  assert.match(
    lastChatRequest.messages[1].content,
    /Requested categories: location_tracking, ai_training, pii_collection/
  );
});

test("reports a non-policy page with one model request", async () => {
  const analysis = validAnalysis();
  analysis.isPrivacyPolicy = false;
  installMistral({ completion: analysis });

  const response = await handler(request({ policy: "A page about cooking recipes." }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.isPrivacyPolicy, false);
  assert.equal(chatRequests.length, 1);
});

test("rejects oversized policies without truncating or calling Mistral", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("should not be called");
  };
  const response = await handler(request({ policy: "a".repeat(100_001) }));
  const result = await response.json();

  assert.equal(response.status, 413);
  assert.match(result.error, /No text was truncated/);
  assert.equal(fetchCount, 0);
});

test("rejects a policy whose estimated input plus output exceeds model context", async () => {
  installMistral();
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/models")) {
      return Response.json({ data: [{ id: "ministral-3b-latest", max_context_length: 4_000 }] });
    }
    throw new Error("completion should not be called");
  };
  const response = await handler(request({ policy: "policy text ".repeat(1_000) }));
  const result = await response.json();

  assert.equal(response.status, 413);
  assert.match(result.error, /including room for the response/);
});

test("maps invalid API credentials to a safe configuration error", async () => {
  installMistral({ modelStatus: 401 });
  const response = await handler(request({ policy: POLICY }));
  const result = await response.json();

  assert.equal(response.status, 503);
  assert.match(result.error, /MISTRAL_API_KEY/);
  assert.doesNotMatch(JSON.stringify(result), /private upstream detail|test-key/);
});

test("maps model access errors and rate limits to controlled responses", async () => {
  installMistral({ modelStatus: 403 });
  let response = await handler(request({ policy: POLICY }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not available/);

  installMistral({ chatStatus: 429 });
  response = await handler(request({ policy: POLICY }));
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /rate-limiting/);
});

test("maps model context errors and rejects unsupported quotations", async () => {
  installMistral({ chatStatus: 400 });
  let response = await handler(request({ policy: POLICY }));
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /context limit/);

  const badQuote = validAnalysis();
  badQuote.findings[0].evidence[0].quote = "A quotation not in the policy.";
  installMistral({ completion: badQuote });
  response = await handler(request({
    policy: POLICY,
    categories: ["pii_collection"],
  }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /every selected topic/);

  const badAiQuote = validAnalysis();
  badAiQuote.ai_training.quote = "A quotation not in the policy.";
  installMistral({ completion: badAiQuote });
  response = await handler(request({
    policy: POLICY,
    categories: ["ai_training"],
  }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /every selected topic/);

  installMistral({ completionContent: "{not valid json" });
  response = await handler(request({ policy: POLICY }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /was not valid JSON/);
});

test("parses a valid analysis wrapped in a JSON markdown fence", async () => {
  installMistral({
    completionContent: `\`\`\`json\n${JSON.stringify(validAnalysis())}\n\`\`\``,
  });
  const response = await handler(request({ policy: POLICY }));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).isPrivacyPolicy, true);
});

test("parses an analysis with raw line breaks and trailing commas in JSON strings", async () => {
  const analysis = validAnalysis();
  const malformedFormatting = JSON.stringify(analysis)
    .replaceAll("\\n", "\n")
    .replaceAll(',"', ',\n"')
    .replace(/,(\s*[}\]])/g, "$1");
  installMistral({
    completionContent: `Here is the result:\n${malformedFormatting}\nDone.`,
  });
  const response = await handler(request({ policy: POLICY }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.isPrivacyPolicy, true);
  assert.equal(result.findings.length, analysis.findings.length);
});

test("reports a model completion cut off by its output token limit", async () => {
  installMistral({ finishReason: "length" });
  const response = await handler(request({ policy: POLICY }));
  const result = await response.json();

  assert.equal(response.status, 502);
  assert.match(result.error, /response limit was reached/);
});

test("keeps valid findings when individual model fields use unexpected values", async () => {
  const irregular = validAnalysis();
  irregular.findings[0].category = "personal information";
  irregular.findings[0].status = "explicitly stated";
  irregular.findings[0].severity = "urgent";
  irregular.findings[1].status = "not sure";
  irregular.findings[2].category = "made_up_category";
  irregular.unknowns.push({
    category: "location",
    explanation: "The text does not say whether precise location is collected.",
  });
  irregular.ai_training = { answer: "not stated", quote: "" };
  installMistral({ completion: irregular });

  const response = await handler(request({
    policy: POLICY,
    categories: ["pii_collection", "location_tracking"],
  }));
  const result = await response.json();

  assert.equal(response.status, 200);
  const personalFinding = result.findings.find(({ category }) => category === "pii_collection");
  assert.equal(personalFinding.status, "explicitly_stated");
  assert.equal(personalFinding.severity, "informational");
  assert.ok(result.unknowns.some(({ category }) => category === "location_tracking"));
  assert.ok(result.findings.every(({ category }) => CATEGORIES_FOR_TEST.has(category)));
});

test("rejects a selected topic when malformed AI data leaves it unassessed", async () => {
  const irregular = validAnalysis();
  irregular.ai_training = null;
  installMistral({ completion: irregular });

  const response = await handler(request({
    policy: POLICY,
    categories: ["ai_training"],
  }));
  const result = await response.json();

  assert.equal(response.status, 502);
  assert.match(result.error, /every selected topic/);
});

test("maps network failures to a safe error response", async () => {
  globalThis.fetch = async () => {
    throw new Error("private connection detail");
  };
  const response = await handler(request({ policy: POLICY }));
  const result = await response.json();

  assert.equal(response.status, 502);
  assert.match(result.error, /Could not connect to Mistral/);
  assert.doesNotMatch(JSON.stringify(result), /private connection detail/);
});

test("validates request shape, methods, and allowed origins", async () => {
  let response = await handler(request({ policy: " \n " }));
  assert.equal(response.status, 400);
  response = await handler(request({ policy: POLICY, categories: [] }));
  assert.equal(response.status, 400);

  response = await handler(request({}, { method: "GET" }));
  assert.equal(response.status, 405);

  response = await handler(request({}, { method: "OPTIONS" }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);

  response = await handler(request({ policy: POLICY }, { origin: "chrome-extension://not-allowed" }));
  assert.equal(response.status, 403);
});

test("fails clearly when required server configuration is missing", async () => {
  delete process.env.MISTRAL_MODEL;
  const response = await handler(request({ policy: POLICY }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured with a Mistral model/);
});
