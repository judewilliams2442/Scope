const LANE = "https://harness-ascte.netlify.app/api/fineprint";
const $ = (id) => document.getElementById(id);
const DEMO = new URLSearchParams(location.search).has("demo");
const settings = globalThis.ScopeSettings;
let currentPreferences;

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
  location_tracking: "Location tracking",
  location: "Location tracking",
  geolocation: "Location tracking",
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

async function getCode() {
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

function render(analysis, usage, sourceText, preferences) {
  if (!isRecord(analysis)) {
    throw new Error("The analysis response was incomplete. Please try again.");
  }

  if (analysis.not_terms) {
    show("err", "This page may not be a privacy policy. Open the policy page and try again.");
    return;
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
  if (Array.isArray(analysis.findings) || Array.isArray(analysis.unknowns)) {
    summaryItems.push(...renderStructured(analysis, sourceText, preferences));
  } else {
    summaryItems.push(...renderLegacy(analysis, sourceText, preferences));
  }
  $("summary").textContent = summaryItems.length
    ? summaryItems.join(" ")
    : "The service returned no findings for your enabled summary categories.";

  const confidence = typeof analysis.confidence_note === "string"
    ? analysis.confidence_note.trim()
    : "";
  const canShowUncategorizedText =
    settings.enabled(preferences).length === settings.count;
  $("confidence").textContent = canShowUncategorizedText ? confidence : "";
  $("confidence").hidden = !canShowUncategorizedText || !confidence;

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
  $("settings-open").addEventListener("click", () => {
    $("settings-error").hidden = true;
    $("settings-message").hidden = true;
    showView("settings");
  });
  $("settings-back").addEventListener("click", () => showView("home"));
  currentPreferences = await settings.initialize((message) =>
    show("settings-error", message)
  );

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
    $("read").disabled = true;
    try {
      currentPreferences = await settings.refresh();
      if (!settings.enabled(currentPreferences).length) {
        showNoEnabledPreferences();
        return;
      }

      if (DEMO) {
        render(
          DEMO_ANALYSIS,
          { tokens: 12345, costCents: 1.4 },
          DEMO_ANALYSIS.ai_training.quote + " " +
            DEMO_ANALYSIS.red_flags.map(({ quote }) => quote).join(" "),
          currentPreferences
        );
        return;
      }

      const code = await getCode();
      if (!code) return;

      show("status", "Reading the open page…");
      const { url, text } = await pageText();
      currentPreferences = await settings.refresh();
      if (!settings.enabled(currentPreferences).length) {
        showNoEnabledPreferences();
        return;
      }

      const enabled = settings.enabled(currentPreferences);
      const disabled = settings.disabled(currentPreferences);
      show("status", "Analyzing the policy…");
      const response = await fetch(LANE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          device: "crew",
          url,
          text,
          priorities: enabled.map(({ category }) => category),
          enabledCategories: enabled.map(({ category, label }) => ({ category, label })),
          summaryInstructions: [
            `Discuss only these enabled privacy categories: ${enabled.map(({ label }) => label).join(", ")}.`,
            `Do not discuss these disabled categories: ${disabled.map(({ label }) => label).join(", ") || "none"}.`,
            "Exclude disabled topics even when they appear in the policy; never imply that excluded practices do not occur.",
            "Be accurate, do not invent policy details, and mark enabled categories not addressed by the policy as unclear or not specified.",
            "Return findings with a category key so the extension can filter them.",
          ].join(" "),
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
      render(data?.analysis, data?.usage, text, currentPreferences);
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

initialize().catch((error) => {
  show("err", error instanceof Error
    ? error.message
    : "Could not load your saved summary preferences.");
});
