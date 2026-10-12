/* THE FINE PRINT — popup logic. */

const LANE = "https://harness-ascte.netlify.app/api/fineprint";
const $ = (id) => document.getElementById(id);

const DEMO = new URLSearchParams(location.search).has("demo");

const DEMO_ANALYSIS = {
  deal: "Free to use because your activity and content are the product, shared with advertising partners.",

  ai_training: {
    answer: "yes",
    quote: "We may use the content you provide to train and improve our machine learning models.",
  },

  they_take: [
    "Everything you post",
    "Contacts you sync",
    "Location while open",
    "Device identifiers",
  ],

  who_gets_it: [
    "Advertising partners",
    "Analytics providers",
    "Affiliated companies",
  ],

  red_flags: [
    {
      flag: "Forced arbitration — you can't sue",
      quote: "You and the Company agree to resolve any disputes through final and binding arbitration.",
    },
    {
      flag: "Terms can change at any time",
      quote: "We reserve the right to modify these Terms at any time without prior notice.",
    },
  ],

  leaveability:
    "You can request account deletion, but backups may be kept for up to 90 days.",

  confidence_note: "",
};

async function getCode() {
  const result = await chrome.storage.local.get("fp-code");
  const stored = result["fp-code"];

  if (stored) {
    return stored;
  }

  $("gate").hidden = false;
  return null;
}

async function pageText() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || !tab.id) {
    throw new Error("No active tab found.");
  }

  // Prevent injecting on browser internal pages.
  if (
    tab.url?.startsWith("chrome://") ||
    tab.url?.startsWith("edge://") ||
    tab.url?.includes("chromewebstore")
  ) {
    throw new Error(
      "Extensions cannot inspect internal browser pages or the Web Store."
    );
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body?.innerText ?? "",
    });

    // Safely check if results exist before accessing them.
    const textResult =
      results && results[0] ? results[0].result : "";

    return {
      url: tab.url ?? "",
      text: textResult,
    };
  } catch (err) {
    throw new Error(
      "Could not read text. Try reloading the target website tab."
    );
  }
}

function li(text) {
  const el = document.createElement("li");
  el.textContent = text;
  return el;
}

function render(analysis, usage) {
  if (analysis.not_terms) {
    show(
      "err",
      `This doesn't look like a terms page — ${
        analysis.note ?? "open the actual terms first."
      }`
    );
    return;
  }

  $("deal").textContent = analysis.deal ?? "—";

  const ai = analysis.ai_training ?? {};

  const cls =
    {
      yes: "ai-yes",
      no: "ai-no",
    }[ai.answer] ?? "ai-unclear";

  const label =
    {
      yes: "YES — your content can train AI.",
      no: "NO — the document says it doesn't.",
      unclear: "UNCLEAR — the document doesn't say.",
    }[ai.answer] ?? "UNCLEAR";

  $("ai").innerHTML = `<span class="${cls}">${label}</span>`;

  $("ai-q").hidden = !ai.quote;

  if (ai.quote) {
    $("ai-q").textContent = `"${ai.quote}"`;
  }

  $("take").replaceChildren(
    ...(analysis.they_take ?? []).map(li)
  );

  $("share").replaceChildren(
    ...(analysis.who_gets_it ?? []).map(li)
  );

  const flags = analysis.red_flags ?? [];

  $("flags-box").hidden = flags.length === 0;

  $("flags").replaceChildren(
    ...flags.map((f) => {
      const d = document.createElement("div");
      d.className = "flag";

      const b = document.createElement("b");
      b.textContent = f.flag;

      const q = document.createElement("blockquote");
      q.textContent = `"${f.quote}"`;

      d.append(b, q);

      return d;
    })
  );

  $("leave").textContent = analysis.leaveability ?? "—";

  if (analysis.confidence_note) {
    show(
      "conf",
      `Honest note: ${analysis.confidence_note}`
    );
  }

  $("meter").textContent = usage
    ? `${usage.tokens} tokens · ${usage.costCents}¢ from the crew's budget`
    : "";

  $("out").hidden = false;
}

function show(id, text) {
  const el = $(id);
  el.textContent = text;
  el.hidden = false;
}

function hideAll() {
  ["status", "err", "conf"].forEach((id) => {
    $(id).hidden = true;
  });

  $("out").hidden = true;
}

$("code")?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && e.target.value.trim()) {
    await chrome.storage.local.set({
      "fp-code": e.target.value.trim().toUpperCase(),
    });

    $("gate").hidden = true;
  }
});

$("read").addEventListener("click", async () => {
  hideAll();

  if (DEMO) {
    render(DEMO_ANALYSIS, {
      tokens: 12345,
      costCents: 1.4,
    });

    return;
  }

  const code = await getCode();

  if (!code) {
    return;
  }

  $("read").disabled = true;

  show("status", "reading the page…");

  try {
    const { url, text } = await pageText();

    show("status", "analyzing the fine print…");

    const r = await fetch(LANE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code,
        device: "crew",
        url,
        text,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      if (r.status === 403) {
        await chrome.storage.local.remove("fp-code");
        $("gate").hidden = false;
      }

      throw new Error(
        data.error ?? "the lane didn't answer"
      );
    }

    $("status").hidden = true;

    render(data.analysis ?? {}, data.usage);
  } catch (ex) {
    $("status").hidden = true;

    show(
      "err",
      ex instanceof Error ? ex.message : String(ex)
    );
  }

  $("read").disabled = false;
});
