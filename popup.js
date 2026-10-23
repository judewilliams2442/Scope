const LANE = "https://harness-ascte.netlify.app/api/fineprint";
const $ = (id) => document.getElementById(id);
const DEMO = new URLSearchParams(location.search).has("demo");
const PREFERENCE_KEY = "scope-preferences";
const ALERT_THRESHOLD_KEY = "scope-alert-threshold";
const DEFAULT_ALERT_THRESHOLD = "medium";
const ALERT_SEVERITY_ORDER = {
  informational: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
let currentAlertThreshold = DEFAULT_ALERT_THRESHOLD;
let alertThresholdChanged = false;
let lastResult = null;

const PREFERENCES = [
  {
    key: "location_tracking",
    label: "Location",
    description: "Collection of precise or approximate location data.",
  },
  {
    key: "ai_training",
    label: "AI training",
    description: "Use of personal data to train or improve AI models.",
  },
  {
    key: "third_party_sharing",
    label: "Sharing or selling",
    description: "Sharing or sale of data to third parties.",
  },
  {
    key: "targeted_advertising",
    label: "Advertising and tracking",
    description: "Targeted ads or tracking across websites and services.",
  },
  {
    key: "sensitive_information",
    label: "Sensitive information",
    description: "Collection of sensitive personal information.",
  },
  {
    key: "retention_deletion",
    label: "Retention and deletion",
    description: "How long data is kept and how it can be deleted.",
  },
  {
    key: "excessive_collection",
    label: "Excessive collection",
    description: "Collection of personal information that may not be needed.",
  },
];

const DEFAULT_PREFERENCES = PREFERENCES.map(({ key }) => key);

const DEMO_ANALYSIS = {
  summary: "This sample policy collects location data, shares information with partners, and keeps some account data after deletion.",
  findings: [
    {
      title: "Approximate location is collected",
      explanation: "The policy says it collects approximate location information.",
      category: "location_tracking",
      severity: "low",
      status: "explicitly_stated",
      evidence: [{ quote: "We collect your approximate location to provide local features." }],
      user_preference_match: true,
    },
    {
      title: "Data may be shared with advertising partners",
      explanation: "The policy allows sharing some information with advertising partners.",
      category: "third_party_sharing",
      severity: "medium",
      status: "explicitly_stated",
      evidence: [{ quote: "We may share information with our advertising partners to provide relevant advertisements." }],
      user_preference_match: true,
    },
    {
      title: "Activity may be used for targeted advertising",
      explanation: "Browsing activity may be used to personalize ads across services.",
      category: "targeted_advertising",
      severity: "high",
      status: "explicitly_stated",
      evidence: [{ quote: "We use your activity across our services to personalize advertisements." }],
      user_preference_match: true,
    },
    {
      title: "Backups may remain after account deletion",
      explanation: "The policy does not give a clear timeframe for removing backup copies.",
      category: "retention_deletion",
      severity: "critical",
      status: "not_specified",
      evidence: [{ quote: "We retain account information for as long as needed to provide our services." }],
      user_preference_match: true,
    },
  ],
  confidence_note: "This sample is for display only and does not describe the current page.",
};
const DEMO_SOURCE_TEXT = DEMO_ANALYSIS.findings
  .flatMap(({ evidence }) => evidence.map(({ quote }) => quote))
  .join(" ");

const CATEGORY_LABELS = {
  location_tracking: "Location",
  ai_training: "AI training",
  third_party_sharing: "Sharing or selling",
  targeted_advertising: "Advertising and tracking",
  sensitive_information: "Sensitive information",
  retention_deletion: "Retention and deletion",
  excessive_collection: "Data collection",
  data_collected: "Data collected",
  data_use: "How data is used",
  data_sharing: "Who receives the data",
  other: "Other finding",
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedPreferences(value) {
  const selected = new Set(
    Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
  );
  return PREFERENCES.filter(({ key }) => selected.has(key)).map(({ key }) => key);
}

async function loadPreferences() {
  if (globalThis.chrome?.storage?.local) {
    const result = await chrome.storage.local.get(PREFERENCE_KEY);
    if (Array.isArray(result[PREFERENCE_KEY])) {
      return normalizedPreferences(result[PREFERENCE_KEY]);
    }
    return [...DEFAULT_PREFERENCES];
  }

  try {
    const stored = localStorage.getItem(PREFERENCE_KEY);
    return stored === null
      ? [...DEFAULT_PREFERENCES]
      : normalizedPreferences(JSON.parse(stored));
  } catch (error) {
    throw new Error("Could not load your saved analysis priorities.");
  }
}

async function savePreferences(preferences) {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [PREFERENCE_KEY]: preferences });
    return;
  }

  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
  } catch (error) {
    throw new Error("Could not save your analysis priorities.");
  }
}

async function loadAlertThreshold() {
  if (globalThis.chrome?.storage?.local) {
    const result = await chrome.storage.local.get(ALERT_THRESHOLD_KEY);
    const stored = result[ALERT_THRESHOLD_KEY];
    return Object.hasOwn(ALERT_SEVERITY_ORDER, stored)
      ? stored
      : DEFAULT_ALERT_THRESHOLD;
  }

  try {
    const stored = localStorage.getItem(ALERT_THRESHOLD_KEY);
    return stored && Object.hasOwn(ALERT_SEVERITY_ORDER, stored)
      ? stored
      : DEFAULT_ALERT_THRESHOLD;
  } catch (error) {
    throw new Error("Could not load your alert threshold.");
  }
}

async function saveAlertThreshold(threshold) {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [ALERT_THRESHOLD_KEY]: threshold });
    return;
  }

  try {
    localStorage.setItem(ALERT_THRESHOLD_KEY, threshold);
  } catch (error) {
    throw new Error("Could not save your alert threshold.");
  }
}

function renderPreferences(selected) {
  const container = $("preferences");
  container.replaceChildren(
    ...PREFERENCES.map(({ key, label, description }) => {
      const row = document.createElement("label");
      row.className = "preference";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "priority";
      checkbox.value = key;
      checkbox.checked = selected.includes(key);
      checkbox.setAttribute("aria-label", label);
      checkbox.addEventListener("change", async () => {
        const next = [...container.querySelectorAll('input[name="priority"]:checked')]
          .map((input) => input.value);
        try {
          await savePreferences(next);
          $("preference-status").textContent = "Priorities saved on this device.";
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          show("err", error.message);
        }
      });

      const copy = document.createElement("span");
      copy.className = "preference-copy";
      const title = document.createElement("strong");
      title.textContent = label;
      const detail = document.createElement("small");
      detail.textContent = description;
      copy.append(title, detail);
      row.append(checkbox, copy);
      return row;
    })
  );
}

async function getCode() {
  const entered = $("code").value.trim();
  if (entered) {
    const code = entered.toUpperCase();
    await chrome.storage.local.set({ "fp-code": code });
    $("gate").hidden = true;
    return code;
  }

  const result = await chrome.storage.local.get("fp-code");
  const stored = result["fp-code"];

  if (stored) {
    return stored;
  }

  $("gate").hidden = false;
  $("code").focus();
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

  if (
    tab.url?.startsWith("chrome://") ||
    tab.url?.startsWith("edge://") ||
    tab.url?.includes("chromewebstore")
  ) {
    throw new Error(
      "Scope cannot inspect internal browser pages or the Web Store."
    );
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body?.innerText ?? "",
    });
    const text = results?.[0]?.result ?? "";

    if (typeof text !== "string" || !text.trim()) {
      throw new Error("No readable page text was found. Open the privacy policy and try again.");
    }

    return {
      url: tab.url ?? "",
      text,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No readable")) {
      throw error;
    }
    throw new Error("Could not read this page. Try reloading the tab and opening its privacy policy.");
  }
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function appendQuote(parent, quote, sourceText) {
  if (typeof quote !== "string" || !quote.trim() || !sourceText.includes(quote)) {
    return false;
  }
  parent.append(textElement("blockquote", "evidence", `“${quote}”`));
  return true;
}

function renderFinding(finding, sourceText) {
  if (!isRecord(finding) || typeof finding.title !== "string" ||
      typeof finding.explanation !== "string") {
    return null;
  }

  const article = document.createElement("article");
  article.className = "finding";
  const heading = document.createElement("div");
  heading.className = "finding-heading";
  heading.append(textElement("h3", "", finding.title));
  article.append(heading);

  const statuses = {
    explicitly_stated: "Stated in policy",
    reasonable_interpretation: "Interpretation",
    not_specified: "Not specified",
    cannot_determine: "Cannot determine",
  };
  if (typeof finding.category === "string" &&
      Object.hasOwn(CATEGORY_LABELS, finding.category)) {
    heading.append(textElement("span", "category", CATEGORY_LABELS[finding.category]));
  }
  if (typeof finding.status === "string" && Object.hasOwn(statuses, finding.status)) {
    article.append(textElement("span", "status-tag", statuses[finding.status]));
  }
  const severities = {
    informational: ["Informational", ""],
    low: ["Low priority", ""],
    medium: ["Review", "severity-review"],
    high: ["Important", "severity-high"],
    critical: ["Critical", "severity-critical"],
  };
  if (typeof finding.severity === "string" &&
      Object.hasOwn(severities, finding.severity)) {
    const [label, severityClass] = severities[finding.severity];
    article.append(textElement("span", `status-tag ${severityClass}`.trim(), label));
  }
  article.append(textElement("p", "finding-copy", finding.explanation));

  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
  for (const item of evidence) {
    if (isRecord(item)) appendQuote(article, item.quote, sourceText);
  }

  if (finding.user_preference_match === true) {
    article.append(textElement("span", "priority-match", "Matches your priorities"));
  }
  return article;
}

function renderStructured(analysis, sourceText) {
  const rendered = [];
  if (Array.isArray(analysis.findings)) {
    for (const finding of analysis.findings) {
      const item = renderFinding(finding, sourceText);
      if (item && meetsAlertThreshold(finding)) rendered.push(item);
    }
  }
  $("findings").replaceChildren(...rendered);
  $("findings-section").hidden = rendered.length === 0;

  const unknowns = [];
  if (Array.isArray(analysis.unknowns)) {
    for (const unknown of analysis.unknowns) {
      if (!isRecord(unknown) || typeof unknown.explanation !== "string") continue;
      const item = document.createElement("article");
      item.className = "finding";
      item.append(
        textElement("h3", "", CATEGORY_LABELS[unknown.category] ?? "Not established"),
        textElement("p", "finding-copy", unknown.explanation)
      );
      unknowns.push(item);
    }
  }
  $("unknowns").replaceChildren(...unknowns);
  $("unknowns-section").hidden = unknowns.length === 0;
  $("legacy-section").hidden = true;
}

function meetsAlertThreshold(finding) {
  const severity = isRecord(finding) ? finding.severity : null;
  if (typeof severity !== "string" ||
      !Object.hasOwn(ALERT_SEVERITY_ORDER, severity)) {
    return true;
  }
  return ALERT_SEVERITY_ORDER[severity] >=
    ALERT_SEVERITY_ORDER[currentAlertThreshold];
}

function stringList(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "string" && value.trim())
    : [];
}

function renderLegacy(analysis, sourceText) {
  const take = stringList(analysis.they_take);
  const share = stringList(analysis.who_gets_it);
  const flags = Array.isArray(analysis.red_flags)
    ? analysis.red_flags.filter((flag) =>
        isRecord(flag) &&
        typeof flag.flag === "string" &&
        typeof flag.quote === "string" &&
        meetsAlertThreshold(flag) &&
        sourceText.includes(flag.quote)
      )
    : [];

  $("legacy-take").replaceChildren(...take.map((value) => textElement("li", "", value)));
  $("legacy-share").replaceChildren(...share.map((value) => textElement("li", "", value)));
  $("legacy-take-section").hidden = take.length === 0;
  $("legacy-share-section").hidden = share.length === 0;

  const ai = isRecord(analysis.ai_training) ? analysis.ai_training : {};
  const aiAnswers = {
    yes: ["Policy says data may be used for AI training.", "concern"],
    no: ["Policy says data is not used for AI training.", "positive"],
    unclear: ["The available text does not establish whether data is used for AI training.", "neutral"],
  };
  const aiSection = $("legacy-ai-section");
  let aiResult = aiAnswers[ai.answer];
  if ((ai.answer === "yes" || ai.answer === "no") &&
      (typeof ai.quote !== "string" || !sourceText.includes(ai.quote))) {
    aiResult = null;
  }
  aiSection.hidden = !aiResult;
  $("legacy-ai-evidence").replaceChildren();
  if (aiResult) {
    $("legacy-ai").replaceChildren(textElement("p", `answer ${aiResult[1]}`, aiResult[0]));
    appendQuote($("legacy-ai-evidence"), ai.quote, sourceText);
  } else {
    $("legacy-ai").replaceChildren();
  }

  $("legacy-flags").replaceChildren(
    ...flags.map((flag) => {
      const item = document.createElement("article");
      item.className = "finding";
      item.append(
        textElement("h3", "", flag.flag),
        textElement("span", "status-tag severity-review", "Potential concern")
      );
      appendQuote(item, flag.quote, sourceText);
      return item;
    })
  );
  $("legacy-flags-section").hidden = flags.length === 0;

  const leaveability = typeof analysis.leaveability === "string"
    ? analysis.leaveability.trim()
    : "";
  $("legacy-leave").textContent = leaveability;
  $("legacy-leave-section").hidden = !leaveability;
  $("legacy-section").hidden =
    take.length + share.length + flags.length === 0 && !leaveability;
  $("findings-section").hidden = true;
  $("unknowns-section").hidden = true;
}

function render(analysis, usage, sourceText) {
  if (!isRecord(analysis)) {
    throw new Error("The analysis response was incomplete. Please try again.");
  }

  if (analysis.not_terms) {
    show("err", "This page may not be a privacy policy. Open the policy page and try again.");
    return;
  }

  lastResult = { analysis, usage, sourceText };

  const summary = typeof analysis.summary === "string"
    ? analysis.summary.trim()
    : typeof analysis.deal === "string" ? analysis.deal.trim() : "";
  if (!summary && !Array.isArray(analysis.findings) &&
      !Array.isArray(analysis.they_take) && !Array.isArray(analysis.who_gets_it)) {
    throw new Error("The analysis response did not contain usable findings. Please try again.");
  }
  $("summary").textContent = summary || "The policy analysis did not return an overview.";

  if (Array.isArray(analysis.findings) || Array.isArray(analysis.unknowns)) {
    renderStructured(analysis, sourceText);
  } else {
    renderLegacy(analysis, sourceText);
  }

  const confidence = typeof analysis.confidence_note === "string"
    ? analysis.confidence_note.trim()
    : "";
  $("confidence").textContent = confidence;
  $("confidence").hidden = !confidence;

  const tokens = Number(usage?.tokens);
  const costCents = Number(usage?.costCents);
  $("meter").textContent = Number.isFinite(tokens) && Number.isFinite(costCents)
    ? `${tokens.toLocaleString()} tokens · ${costCents}¢ from the crew budget`
    : "";
  $("out").hidden = false;
}

function show(id, text) {
  const element = $(id);
  element.textContent = text;
  element.hidden = false;
}

function hideAll() {
  ["status", "err", "confidence"].forEach((id) => {
    $(id).hidden = true;
  });
  $("out").hidden = true;
}

function initialize() {
  renderPreferences([...DEFAULT_PREFERENCES]);
  loadPreferences()
    .then(renderPreferences)
    .catch((error) => show("err", error.message));

  loadAlertThreshold()
    .then((threshold) => {
      if (alertThresholdChanged) return;
      currentAlertThreshold = threshold;
      $("alert-threshold").value = threshold;
      if (lastResult) {
        render(lastResult.analysis, lastResult.usage, lastResult.sourceText);
      }
    })
    .catch((error) => show("err", error.message));

  $("settings-toggle").addEventListener("click", () => {
    const panel = $("settings-panel");
    panel.hidden = !panel.hidden;
    $("settings-toggle").setAttribute("aria-expanded", String(!panel.hidden));
  });

  $("alert-threshold").addEventListener("change", async (event) => {
    const previous = currentAlertThreshold;
    const threshold = event.target.value;
    alertThresholdChanged = true;
    if (!Object.hasOwn(ALERT_SEVERITY_ORDER, threshold)) {
      alertThresholdChanged = false;
      event.target.value = previous;
      return;
    }

    currentAlertThreshold = threshold;
    try {
      await saveAlertThreshold(threshold);
      $("threshold-status").textContent = "Alert threshold saved on this device.";
      if (lastResult) {
        render(lastResult.analysis, lastResult.usage, lastResult.sourceText);
      }
    } catch (error) {
      currentAlertThreshold = previous;
      event.target.value = previous;
      show("err", error.message);
    }
  });

  $("code")?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && event.target.value.trim()) {
      try {
        await chrome.storage.local.set({
          "fp-code": event.target.value.trim().toUpperCase(),
        });
        $("gate").hidden = true;
      } catch (error) {
        show("err", "Could not save the crew code. Please try again.");
      }
    }
  });

  $("read").addEventListener("click", async () => {
    hideAll();
    if (DEMO) {
      render(DEMO_ANALYSIS, { tokens: 12345, costCents: 1.4 }, DEMO_SOURCE_TEXT);
      return;
    }

    $("read").disabled = true;
    try {
      const code = await getCode();
      if (!code) return;

      show("status", "Reading the open page…");
      const { url, text } = await pageText();
      show("status", "Analyzing the policy…");
      const preferences = await loadPreferences();
      const response = await fetch(LANE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          device: "crew",
          url,
          text,
          priorities: preferences,
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error("The analysis service returned an unreadable response. Please try again.");
      }

      if (!response.ok) {
        if (response.status === 403) {
          await chrome.storage.local.remove("fp-code");
          $("gate").hidden = false;
        }
        const messages = {
          403: "The crew code was not accepted. Enter the current code to continue.",
          429: "The analysis limit has been reached. Please try again later.",
        };
        throw new Error(messages[response.status] ??
          "The analysis service could not complete the request. Please try again later.");
      }

      $("status").hidden = true;
      render(data?.analysis, data?.usage, text);
    } catch (error) {
      $("status").hidden = true;
      show("err", error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.");
    } finally {
      $("read").disabled = false;
    }
  });
}

initialize();
