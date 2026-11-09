const $ = (id) => document.getElementById(id);
const DEMO = new URLSearchParams(location.search).has("demo");
const settings = globalThis.ScopeSettings;
const API_ENDPOINT = "https://heroic-banoffee-57c451.netlify.app/api/fineprint";
const ANALYSIS_STORAGE_PREFIX = "scope-analysis-";
let currentPreferences;
let analysisController;

const DEMO_ANALYSIS = {
  deal: "The policy describes collecting account and device information, sharing some data with service providers, and using activity for advertising.",
  ai_training: {
    answer: "unclear",
    quote: "",
  },
  they_take: [
    "Account details and contact information",
    "Device identifiers and usage activity",
  ],
  who_gets_it: ["Service providers", "Advertising partners"],
  red_flags: [
    {
      flag: "The policy allows sharing information with advertising partners.",
      quote: "We may share information with our advertising partners to provide relevant advertisements.",
    },
  ],
  leaveability: "You may request account deletion. The policy does not specify how long backups are retained.",
  confidence_note: "This sample is for display only and does not describe the current page.",
};

const CATEGORY_LABELS = {
  location_tracking: "Location and tracking",
  location: "Location and tracking",
  geolocation: "Location and tracking",
  ai_training: "AI data training",
  ai_data_training: "AI data training",
  pii_collection: "Personal information collection",
  pii: "Personal information collection",
  personal_information: "Personal information collection",
  sensitive_information: "Personal information collection",
  third_party_sharing: "Third-party sharing",
  data_sharing: "Third-party sharing",
  targeted_advertising: "Targeted advertising",
  advertising: "Targeted advertising",
  retention_deletion: "Retention and deletion",
  retention: "Retention and deletion",
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function pageSnapshot() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || typeof tab.id !== "number") {
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
      func: () => ({
        text: document.body?.innerText ?? "",
        url: location.href,
        documentStart: performance.timeOrigin,
      }),
    });
    const snapshot = results?.[0]?.result;

    if (!isRecord(snapshot) ||
        typeof snapshot.text !== "string" ||
        !snapshot.text.trim() ||
        typeof snapshot.url !== "string" ||
        typeof snapshot.documentStart !== "number") {
      throw new Error("Nothing was found to analyze!");
    }

    return {
      tabId: tab.id,
      url: snapshot.url,
      documentStart: snapshot.documentStart,
      text: snapshot.text,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Nothing was found to analyze!") {
      throw error;
    }
    throw new Error("Could not read this page. Try reloading the tab and opening its privacy policy.");
  }
}

function analysisStorageKey(tabId) {
  return `${ANALYSIS_STORAGE_PREFIX}${tabId}`;
}

async function restoreAnalysis() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab || typeof tab.id !== "number" || tab.status !== "complete" ||
      tab.url?.startsWith("chrome://") ||
      tab.url?.startsWith("edge://") ||
      tab.url?.includes("chromewebstore")) {
    return;
  }

  const key = analysisStorageKey(tab.id);
  const saved = await chrome.storage.local.get(key);
  const cached = saved[key];
  if (!isRecord(cached)) return;

  const snapshot = await pageSnapshot();
  if (cached.url !== snapshot.url ||
      cached.documentStart !== snapshot.documentStart) {
    await chrome.storage.local.remove(key);
    return;
  }
  if (typeof cached.sourceText !== "string" || !isRecord(cached.analysis)) {
    await chrome.storage.local.remove(key);
    return;
  }

  render(cached.analysis, cached.sourceText, currentPreferences);
}

async function saveAnalysis(snapshot, analysis) {
  await chrome.storage.local.set({
    [analysisStorageKey(snapshot.tabId)]: {
      url: snapshot.url,
      documentStart: snapshot.documentStart,
      sourceText: snapshot.text,
      analysis,
    },
  });
}

function validateAnalysis(
  value,
  sourceText,
  preferences
) {
  if (!isRecord(value) || typeof value.isPrivacyPolicy !== "boolean" ||
      !Array.isArray(value.findings) || !Array.isArray(value.unknowns)) {
    throw new Error("The analysis service returned an incomplete response. Please try again.");
  }
  if (!value.isPrivacyPolicy) {
    return { not_terms: true };
  }

  const statuses = [
    "explicitly_stated",
    "reasonable_interpretation",
    "not_specified",
    "cannot_determine",
  ];
  const severities = ["informational", "low", "medium", "high", "critical"];
  const findings = value.findings.map((finding) => {
    if (!isRecord(finding) ||
        typeof finding.category !== "string" ||
        !Object.hasOwn(CATEGORY_LABELS, finding.category) ||
        typeof finding.title !== "string" ||
        !finding.title.trim() ||
        typeof finding.explanation !== "string" ||
        !finding.explanation.trim() ||
        !statuses.includes(finding.status) ||
        !severities.includes(finding.severity) ||
        !Array.isArray(finding.evidence) ||
        !finding.evidence.every((item) => isRecord(item) && typeof item.quote === "string")) {
      throw new Error("The analysis service returned an invalid finding. Please try again.");
    }
    return finding;
  }).filter((finding) =>
    settings.isCategoryEnabled(finding.category, preferences)
  ).map((finding) => ({
    ...finding,
    evidence: finding.evidence.filter((item) =>
      item.quote.trim() && sourceText.includes(item.quote)
    ),
  }));
  const findingCategories = new Set(findings.map(({ category }) => category));
  const unknowns = value.unknowns.map((unknown) => {
    if (!isRecord(unknown) ||
        typeof unknown.category !== "string" ||
        !Object.hasOwn(CATEGORY_LABELS, unknown.category) ||
        typeof unknown.explanation !== "string" ||
        !unknown.explanation.trim()) {
      throw new Error("The analysis service returned invalid missing-information details. Please try again.");
    }
    return unknown;
  }).filter((unknown) =>
    settings.isCategoryEnabled(unknown.category, preferences) &&
    !findingCategories.has(unknown.category)
  );
  if (!findings.length && !unknowns.length) {
    throw new Error("The analysis service did not return usable findings. Please try again.");
  }
  return { ...value, findings, unknowns };
}

async function analyzePolicy(text, preferences, controller) {
  if (new URL(API_ENDPOINT).hostname === "your-netlify-site.netlify.app") {
    throw new Error(
      "Configure API_ENDPOINT in popup.js with your own Netlify site URL before analyzing."
    );
  }
  show("status", "Sending policy text to Mistral for analysis…");
  let response;
  try {
    response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: text,
        categories: settings.enabled(preferences).map(({ category }) => category),
      }),
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Could not reach Scope's analysis service. Check your connection and try again.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Scope's analysis service returned an invalid response. Please try again.");
  }
  if (!response.ok) {
    const message = isRecord(result) && typeof result.error === "string"
      ? result.error
      : `Analysis failed with HTTP ${response.status}. Please try again.`;
    throw new Error(message);
  }

  return validateAnalysis(result, text, preferences);
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
    article.append(textElement("span", "priority-match", "Matches your preferences"));
  }
  return article;
}

function renderStructured(analysis, sourceText, preferences) {
  const findings = settings.filterByPreferences(
    Array.isArray(analysis.findings) ? analysis.findings : [],
    preferences
  );
  const rendered = [];
  for (const finding of findings) {
    const item = renderFinding(finding, sourceText);
    if (item) rendered.push(item);
  }
  $("findings").replaceChildren(...rendered);
  $("findings-section").hidden = rendered.length === 0;

  const unknowns = [];
  const filteredUnknowns = settings.filterByPreferences(
    Array.isArray(analysis.unknowns) ? analysis.unknowns : [],
    preferences
  );
  for (const unknown of filteredUnknowns) {
    if (!isRecord(unknown) || typeof unknown.explanation !== "string") continue;
    const item = document.createElement("article");
    item.className = "finding";
    item.append(
      textElement("h3", "", CATEGORY_LABELS[unknown.category] ?? "Not established"),
      textElement("p", "finding-copy", unknown.explanation)
    );
    unknowns.push(item);
  }
  $("unknowns").replaceChildren(...unknowns);
  $("unknowns-section").hidden = unknowns.length === 0;
  $("legacy-section").hidden = true;
  return [
    ...findings
      .filter((finding) => typeof finding?.explanation === "string")
      .map((finding) => finding.explanation.trim()),
    ...filteredUnknowns
      .filter((unknown) => typeof unknown?.explanation === "string")
      .map((unknown) => unknown.explanation.trim()),
  ].filter(Boolean);
}

function stringList(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "string" && value.trim())
    : [];
}

function renderLegacy(analysis, sourceText, preferences) {
  const take = preferences.piiCollection ? stringList(analysis.they_take) : [];
  const share = preferences.thirdPartySharing ? stringList(analysis.who_gets_it) : [];
  const flags = Array.isArray(analysis.red_flags)
    ? analysis.red_flags.filter((flag) =>
        isRecord(flag) &&
        typeof flag.flag === "string" &&
        typeof flag.quote === "string" &&
        sourceText.includes(flag.quote) &&
        settings.isCategoryEnabled(flag.category, preferences)
      )
    : [];

  $("legacy-take").replaceChildren(...take.map((value) => textElement("li", "", value)));
  $("legacy-share").replaceChildren(...share.map((value) => textElement("li", "", value)));
  $("legacy-take-section").hidden = take.length === 0;
  $("legacy-share-section").hidden = share.length === 0;

  const ai = preferences.aiDataTraining && isRecord(analysis.ai_training)
    ? analysis.ai_training
    : {};
  const aiAnswers = {
    yes: ["Policy says data may be used for AI training.", "concern"],
    no: ["Policy says data is not used for AI training.", "positive"],
    unclear: ["The available text does not establish whether data is used for AI training.", "neutral"],
  };
  const aiSection = $("legacy-ai-section");
  let aiResult = Object.hasOwn(aiAnswers, ai.answer)
    ? aiAnswers[ai.answer]
    : null;
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

  const leaveability = preferences.retentionDeletion &&
      typeof analysis.leaveability === "string"
    ? analysis.leaveability.trim()
    : "";
  $("legacy-leave").textContent = leaveability;
  $("legacy-leave-section").hidden = !leaveability;
  $("legacy-section").hidden =
    take.length + share.length + flags.length === 0 && !leaveability;
  $("findings-section").hidden = true;
  $("unknowns-section").hidden = true;
  return [
    ...take.map((item) => `Personal information: ${item}`),
    ...share.map((item) => `Third-party sharing: ${item}`),
    ...(aiResult ? [`AI data training: ${aiResult[0]}`] : []),
    ...flags.map((flag) => flag.flag),
    ...(leaveability ? [`Retention and deletion: ${leaveability}`] : []),
  ];
}

function render(analysis, sourceText, preferences) {
  if (!isRecord(analysis)) {
    throw new Error("The analysis response was incomplete. Please try again.");
  }

  if (analysis.not_terms) {
    show("err", "This page may not be a privacy policy. Open the policy page and try again.");
    return false;
  }

  if (!Array.isArray(analysis.findings) &&
      !Array.isArray(analysis.unknowns) &&
      !Array.isArray(analysis.they_take) &&
      !Array.isArray(analysis.who_gets_it) &&
      !Array.isArray(analysis.red_flags) &&
      !isRecord(analysis.ai_training) &&
      typeof analysis.leaveability !== "string") {
    throw new Error("The analysis response did not contain usable findings. Please try again.");
  }

  const summaryItems = [];
  const showDeal = settings.enabled(preferences).length === settings.count;
  if (showDeal && typeof analysis.deal === "string" && analysis.deal.trim()) {
    summaryItems.push(analysis.deal.trim());
  }
  const dealEvidence = [];
  if (showDeal && Array.isArray(analysis.deal_evidence)) {
    for (const item of analysis.deal_evidence) {
      if (!isRecord(item) || typeof item.quote !== "string") continue;
      const holder = document.createElement("div");
      if (appendQuote(holder, item.quote, sourceText)) {
        dealEvidence.push(...holder.childNodes);
      }
    }
  }
  $("deal-evidence").replaceChildren(...dealEvidence);
  if (Array.isArray(analysis.findings) || Array.isArray(analysis.unknowns)) {
    summaryItems.push(...renderStructured(analysis, sourceText, preferences));
  } else {
    summaryItems.push(...renderLegacy(analysis, sourceText, preferences));
  }
  if (!summaryItems.length) {
    show("err", "Nothing was found to analyze!");
    return false;
  }
  $("summary").replaceChildren(
    ...summaryItems.map((item) => textElement("li", "", item))
  );

  const confidence = typeof analysis.confidence_note === "string"
    ? analysis.confidence_note.trim()
    : "";
  const canShowUncategorizedText =
    settings.enabled(preferences).length === settings.count;
  $("confidence").textContent = canShowUncategorizedText ? confidence : "";
  $("confidence-section").hidden = !canShowUncategorizedText || !confidence;

  $("out").hidden = false;
  updateSummaryToggle();
  return true;
}

function visibleSummarySections() {
  const out = $("out");
  return [...out.querySelectorAll("details.result-section")].filter((section) => {
    for (let element = section; element && element !== out; element = element.parentElement) {
      if (element.hidden) return false;
    }
    return true;
  });
}

function updateSummaryToggle() {
  const sections = visibleSummarySections();
  const button = $("toggle-summaries");
  button.hidden = $("out").hidden || sections.length === 0;
  button.textContent = sections.some((section) => !section.open)
    ? "Expand All"
    : "Collapse All";
}

function show(id, text) {
  const element = $(id);
  element.textContent = text;
  element.hidden = false;
}

function hideAll() {
  ["status", "err", "confidence-section", "toggle-summaries"].forEach((id) => {
    $(id).hidden = true;
  });
  $("out").hidden = true;
}

function showNoEnabledPreferences() {
  showView("settings");
  show(
    "settings-message",
    "No summary categories are enabled. Turn on at least one topic to analyze a page."
  );
}

function showView(view) {
  const isSettings = view === "settings";
  $("home-view").hidden = isSettings;
  $("settings-view").hidden = !isSettings;
  if (isSettings) {
    $("settings-heading").focus();
  } else {
    $("settings-open").focus();
  }
}

async function initialize() {
  hideAll();
  $("result-label").textContent = DEMO ? "Sample analysis" : "Analyzed by Mistral";
  if (DEMO) {
    $("privacy-note").textContent = "The demo preview does not send policy text.";
  }
  $("out").querySelectorAll("details.result-section").forEach((section) => {
    section.addEventListener("toggle", updateSummaryToggle);
  });
  $("toggle-summaries").addEventListener("click", () => {
    const sections = visibleSummarySections();
    const expand = sections.some((section) => !section.open);
    sections.forEach((section) => {
      section.open = expand;
    });
    updateSummaryToggle();
  });
  $("settings-open").addEventListener("click", () => {
    $("settings-error").hidden = true;
    $("settings-message").hidden = true;
    showView("settings");
  });
  $("settings-back").addEventListener("click", () => showView("home"));
  currentPreferences = await settings.initialize((message) =>
    show("settings-error", message)
  );
  if (!DEMO) {
    try {
      await restoreAnalysis();
    } catch {
      show("status", "Could not check for a saved summary. Analyze this page to continue.");
    }
  }

  $("cancel-analysis").addEventListener("click", () => {
    analysisController?.abort();
  });

  $("read").addEventListener("click", async () => {
    hideAll();
    $("read").disabled = true;
    $("cancel-analysis").hidden = false;
    analysisController = new AbortController();
    try {
      currentPreferences = await settings.refresh();
      if (!settings.enabled(currentPreferences).length) {
        showNoEnabledPreferences();
        return;
      }

      if (DEMO) {
        render(
          DEMO_ANALYSIS,
          DEMO_ANALYSIS.ai_training.quote + " " +
            DEMO_ANALYSIS.red_flags.map(({ quote }) => quote).join(" "),
          currentPreferences
        );
        return;
      }

      show("status", "Reading the open page…");
      const snapshot = await pageSnapshot();
      if (analysisController.signal.aborted) {
        show("status", "Analysis canceled.");
        return;
      }
      currentPreferences = await settings.refresh();
      if (analysisController.signal.aborted) {
        show("status", "Analysis canceled.");
        return;
      }
      if (!settings.enabled(currentPreferences).length) {
        showNoEnabledPreferences();
        return;
      }

      const analysis = await analyzePolicy(
        snapshot.text,
        currentPreferences,
        analysisController
      );
      $("status").hidden = true;
      if (render(analysis, snapshot.text, currentPreferences)) {
        try {
          await saveAnalysis(snapshot, analysis);
        } catch {
          show("status", "Analysis is ready, but the summary could not be saved on this device.");
        }
      }
    } catch (error) {
      $("status").hidden = true;
      if (analysisController.signal.aborted) {
        show("status", "Analysis canceled.");
      } else {
        show("err", error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.");
      }
    } finally {
      analysisController = null;
      $("cancel-analysis").hidden = true;
      $("read").disabled = false;
    }
  });
}

initialize().catch((error) => {
  show("err", error instanceof Error
    ? error.message
    : "Could not load your saved summary preferences.");
});
