const LANE = "https://harness-ascte.netlify.app/api/fineprint";
const $ = (id) => document.getElementById(id);
const DEMO = new URLSearchParams(location.search).has("demo");
const PREFERENCE_KEY = "scope-preferences";

const PREFERENCES = [
  {
    key: "locationTracking",
    category: "location_tracking",
    label: "Location tracking",
    description: "Location data, GPS, geolocation, and location-based monitoring.",
  },
  {
    key: "aiDataTraining",
    category: "ai_training",
    label: "AI data training",
    description: "Using user data to train or improve AI or machine-learning models.",
  },
  {
    key: "piiCollection",
    category: "pii_collection",
    label: "Personal information collection",
    description: "Collecting identifying details such as names, email, phone, or IP addresses.",
  },
  {
    key: "thirdPartySharing",
    category: "third_party_sharing",
    label: "Third-party sharing",
    description: "Sharing, selling, or disclosing data to external entities.",
  },
  {
    key: "targetedAdvertising",
    category: "targeted_advertising",
    label: "Targeted advertising",
    description: "Personalized ads, advertising profiles, and ad-network tracking.",
  },
  {
    key: "retentionDeletion",
    category: "retention_deletion",
    label: "Retention and deletion",
    description: "How long data is kept, deletion policies, and removal requests.",
  },
];

const DEFAULT_PREFERENCES = Object.fromEntries(
  PREFERENCES.map(({ key }) => [key, true])
);
let currentPreferences = { ...DEFAULT_PREFERENCES };
let preferenceWrites = Promise.resolve();

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

function normalizedPreferences(value) {
  if (Array.isArray(value)) {
    const selected = new Set(value.filter((item) => typeof item === "string"));
    return {
      locationTracking: selected.has("location_tracking"),
      aiDataTraining: selected.has("ai_training"),
      piiCollection: selected.has("sensitive_information") ||
        selected.has("excessive_collection"),
      thirdPartySharing: selected.has("third_party_sharing"),
      targetedAdvertising: selected.has("targeted_advertising"),
      retentionDeletion: selected.has("retention_deletion"),
    };
  }

  return Object.fromEntries(
    PREFERENCES.map(({ key }) => [
      key,
      isRecord(value) && typeof value[key] === "boolean"
        ? value[key]
        : true,
    ])
  );
}

async function loadPreferences() {
  if (globalThis.chrome?.storage?.local) {
    const result = await chrome.storage.local.get(PREFERENCE_KEY);
    const stored = result[PREFERENCE_KEY];
    const preferences = normalizedPreferences(stored);
    const isCurrentObject = isRecord(stored) &&
      PREFERENCES.every(({ key }) => typeof stored[key] === "boolean");
    if (!isCurrentObject) {
      await chrome.storage.local.set({ [PREFERENCE_KEY]: preferences });
    }
    return preferences;
  }

  try {
    const serialized = localStorage.getItem(PREFERENCE_KEY);
    const stored = serialized === null ? undefined : JSON.parse(serialized);
    const preferences = serialized === null
      ? { ...DEFAULT_PREFERENCES }
      : normalizedPreferences(stored);
    if (serialized === null || !isRecord(stored) ||
        !PREFERENCES.every(({ key }) =>
          typeof stored[key] === "boolean")) {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
    }
    return preferences;
  } catch (error) {
    if (error instanceof SyntaxError) {
      try {
        localStorage.setItem(PREFERENCE_KEY, JSON.stringify(DEFAULT_PREFERENCES));
        return { ...DEFAULT_PREFERENCES };
      } catch {
        throw new Error("Could not initialize your summary preferences.");
      }
    }
    throw new Error("Could not load your saved summary preferences.");
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
    throw new Error("Could not save your summary preferences.");
  }
}

function renderPreferences(preferences) {
  const container = $("preferences");
  container.replaceChildren(
    ...PREFERENCES.map(({ key, label, description }) => {
      const row = document.createElement("label");
      row.className = "preference";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "preference";
      checkbox.value = key;
      checkbox.checked = preferences[key];
      checkbox.setAttribute("aria-label", `${label}: include in summary`);
      checkbox.addEventListener("change", async () => {
        const previous = { ...currentPreferences };
        currentPreferences = { ...currentPreferences, [key]: checkbox.checked };
        container.querySelectorAll('input[name="preference"]').forEach((input) => {
          input.disabled = true;
        });
        const write = preferenceWrites.then(() =>
          savePreferences(currentPreferences)
        );
        preferenceWrites = write.catch(() => {});
        try {
          await write;
          $("preference-status").textContent = "Summary preferences saved on this device.";
        } catch (error) {
          currentPreferences = previous;
          renderPreferences(currentPreferences);
          show("err", error instanceof Error
            ? error.message
            : "Could not save your summary preferences.");
        } finally {
          container.querySelectorAll('input[name="preference"]').forEach((input) => {
            input.disabled = false;
          });
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

function enabledPreferences(preferences) {
  return PREFERENCES.filter(({ key }) => preferences[key]);
}

function preferenceForCategory(category) {
  const keyByCategory = {
    location_tracking: "locationTracking",
    location: "locationTracking",
    geolocation: "locationTracking",
    ai_training: "aiDataTraining",
    ai_data_training: "aiDataTraining",
    pii_collection: "piiCollection",
    pii: "piiCollection",
    personal_information: "piiCollection",
    sensitive_information: "piiCollection",
    third_party_sharing: "thirdPartySharing",
    data_sharing: "thirdPartySharing",
    targeted_advertising: "targetedAdvertising",
    advertising: "targetedAdvertising",
    retention_deletion: "retentionDeletion",
    retention: "retentionDeletion",
  };
  return typeof category === "string" ? keyByCategory[category] : undefined;
}

function filterByPreferences(items, preferences) {
  return items.filter((item) => {
    const preference = preferenceForCategory(item?.category);
    return preference && preferences[preference];
  });
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
  const findings = filterByPreferences(
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
  const filteredUnknowns = filterByPreferences(
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
        preferenceForCategory(flag.category) !== undefined &&
        preferences[preferenceForCategory(flag.category)]
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
  const canShowUncategorizedText = enabledPreferences(preferences).length === PREFERENCES.length;
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
  $("summary-preferences").open = true;
  show(
    "status",
    "No summary categories are enabled. Open Summary Preferences above and turn on at least one topic."
  );
}

async function initialize() {
  currentPreferences = await loadPreferences();
  renderPreferences(currentPreferences);

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
      await preferenceWrites;
      currentPreferences = await loadPreferences();
      renderPreferences(currentPreferences);
      if (!enabledPreferences(currentPreferences).length) {
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
      await preferenceWrites;
      currentPreferences = await loadPreferences();
      renderPreferences(currentPreferences);
      if (!enabledPreferences(currentPreferences).length) {
        showNoEnabledPreferences();
        return;
      }

      const enabled = enabledPreferences(currentPreferences);
      const disabled = PREFERENCES.filter(({ key }) => !currentPreferences[key]);
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
