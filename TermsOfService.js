(() => {
  const $ = (id) => document.getElementById(id);
  const DEMO = new URLSearchParams(location.search).has("demo");
  const API_ENDPOINT = "https://heroic-banoffee-57c451.netlify.app/api/fineprint";
  const CATEGORIES = {
    account_termination: "Account termination and suspension",
    payment_fees: "Payments, fees, and subscriptions",
    user_content_license: "Your content and content license",
    dispute_resolution: "Disputes, arbitration, and class actions",
    liability_warranty: "Warranties and liability limits",
    governing_law: "Governing law and jurisdiction",
    unilateral_changes: "Changes to the terms",
  };
  const DEMO_ANALYSIS = {
    findings: [{
      category: "account_termination",
      title: "Account suspension",
      explanation: "The service may suspend accounts for a terms breach.",
      status: "explicitly_stated",
      severity: "medium",
      evidence: [{
        quote: "We may suspend your account at any time for a breach of these terms.",
      }],
    }],
    unknowns: [{
      category: "dispute_resolution",
      explanation: "This sample does not establish how disputes are resolved.",
    }],
    confidence_note: "This sample is for display only and does not describe the current page.",
  };
  const DEMO_TEXT = DEMO_ANALYSIS.findings[0].evidence[0].quote;
  let controller;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function show(id, message) {
    const element = $(id);
    element.textContent = message;
    element.hidden = false;
  }

  function switchMode(terms) {
    $("home-view").hidden = terms;
    $("terms-view").hidden = !terms;
    $("privacy-mode").setAttribute("aria-pressed", String(!terms));
    $("terms-mode").setAttribute("aria-pressed", String(terms));
    $("terms-privacy-mode").setAttribute("aria-pressed", String(!terms));
    $("terms-current-mode").setAttribute("aria-pressed", String(terms));
    document.querySelector(".context").textContent =
      "Privacy Policy and Terms of Service Analyzer";
    document.title = terms
      ? "Scope — Terms of Service Analysis"
      : "Scope — Privacy Policy Analysis";
    if (terms) $("analyze-terms").focus();
    else $("read").focus();
  }

  async function pageText() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab found.");
    if (
      tab.url?.startsWith("chrome://") ||
      tab.url?.startsWith("edge://") ||
      tab.url?.includes("chromewebstore")
    ) {
      throw new Error("Scope cannot inspect internal browser pages or the Web Store.");
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body?.innerText ?? "",
      });
      const text = results?.[0]?.result ?? "";
      if (typeof text !== "string" || !text.trim()) {
        throw new Error("Nothing was found to analyze!");
      }
      return text;
    } catch (error) {
      if (error instanceof Error &&
          ["Nothing was found to analyze!", "Scope cannot inspect internal browser pages or the Web Store."]
            .includes(error.message)) {
        throw error;
      }
      throw new Error("Could not read this page. Try reloading the tab and opening its terms of service.");
    }
  }

  function validateAnalysis(value, sourceText, preferences) {
    if (!isRecord(value) || typeof value.isTermsOfService !== "boolean" ||
        !Array.isArray(value.findings) || !Array.isArray(value.unknowns)) {
      throw new Error("The analysis service returned an incomplete response. Please try again.");
    }
    if (!value.isTermsOfService) {
      return { notTerms: true };
    }

    const statuses = [
      "explicitly_stated",
      "reasonable_interpretation",
      "not_specified",
      "cannot_determine",
    ];
    const findings = value.findings.map((finding) => {
      if (!isRecord(finding) ||
          typeof finding.category !== "string" ||
          !Object.hasOwn(CATEGORIES, finding.category) ||
          typeof finding.title !== "string" ||
          !finding.title.trim() ||
          typeof finding.explanation !== "string" ||
          !finding.explanation.trim() ||
          !statuses.includes(finding.status) ||
          !Array.isArray(finding.evidence) ||
          !finding.evidence.every((item) => isRecord(item) && typeof item.quote === "string")) {
        throw new Error("The analysis service returned an invalid finding. Please try again.");
      }
      return {
        ...finding,
        evidence: finding.evidence.filter((item) =>
          item.quote.trim() && sourceText.includes(item.quote)
        ),
      };
    }).filter((finding) => settings.isCategoryEnabled(finding.category, preferences));
    const findingCategories = new Set(findings.map(({ category }) => category));
    const unknowns = value.unknowns.map((unknown) => {
      if (!isRecord(unknown) ||
          typeof unknown.category !== "string" ||
          !Object.hasOwn(CATEGORIES, unknown.category) ||
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

  async function analyze(text, activeController, categories, preferences) {
    if (new URL(API_ENDPOINT).hostname === "your-netlify-site.netlify.app") {
      throw new Error("Configure API_ENDPOINT in TermsOfService.js with your own Netlify site URL before analyzing.");
    }
    show("terms-status", "Sending terms text to Mistral for analysis…");
    let response;
    try {
      response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy: text,
          documentType: "terms",
          categories,
        }),
        credentials: "omit",
        cache: "no-store",
        signal: activeController.signal,
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

  function showNoEnabledPreferences() {
    $("terms-view").hidden = true;
    $("home-view").hidden = true;
    $("settings-view").hidden = false;
    show("settings-message", "No Terms of Service topics are enabled. Turn on at least one topic to analyze a page.");
    $("settings-heading").focus();
  }

  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function render(analysis, sourceText) {
    if (analysis.notTerms) {
      show("terms-error", "This page may not be Terms of Service. Open the terms page and try again.");
      return;
    }

    const findings = analysis.findings.map((finding) => {
      const article = document.createElement("article");
      article.className = "finding";
      const heading = document.createElement("div");
      heading.className = "finding-heading";
      heading.append(textElement("h3", "", finding.title));
      heading.append(textElement("span", "category", CATEGORIES[finding.category]));
      article.append(heading);
      article.append(textElement("p", "finding-copy", finding.explanation));
      const status = {
        explicitly_stated: "Stated in terms",
        reasonable_interpretation: "Interpretation",
        not_specified: "Not specified",
        cannot_determine: "Cannot determine",
      }[finding.status];
      article.append(textElement("span", "status-tag", status));
      for (const item of finding.evidence) {
        if (item.quote.trim() && sourceText.includes(item.quote)) {
          article.append(textElement("blockquote", "evidence", `“${item.quote}”`));
        }
      }
      return article;
    });
    $("terms-findings").replaceChildren(...findings);

    const unknowns = analysis.unknowns.map((unknown) => {
      const article = document.createElement("article");
      article.className = "finding";
      article.append(
        textElement("h3", "", CATEGORIES[unknown.category]),
        textElement("p", "finding-copy", unknown.explanation)
      );
      return article;
    });
    $("terms-unknowns").replaceChildren(...unknowns);
    $("terms-unknowns-section").hidden = unknowns.length === 0;
    const confidence = typeof analysis.confidence_note === "string"
      ? analysis.confidence_note.trim()
      : "";
    $("terms-confidence").textContent = confidence;
    $("terms-confidence-section").hidden = !confidence;
    $("terms-out").hidden = false;
    updateSummaryToggle();
  }

  function visibleSections() {
    const out = $("terms-out");
    return [...out.querySelectorAll("details.result-section")].filter((section) => {
      for (let element = section; element && element !== out; element = element.parentElement) {
        if (element.hidden) return false;
      }
      return true;
    });
  }

  function updateSummaryToggle() {
    const sections = visibleSections();
    const button = $("terms-toggle-summaries");
    button.hidden = $("terms-out").hidden || sections.length === 0;
    button.textContent = sections.some((section) => !section.open)
      ? "Expand All"
      : "Collapse All";
  }

  function resetResults() {
    ["terms-status", "terms-error", "terms-out", "terms-toggle-summaries"]
      .forEach((id) => { $(id).hidden = true; });
  }

  $("privacy-mode").addEventListener("click", () => switchMode(false));
  $("terms-mode").addEventListener("click", () => switchMode(true));
  $("terms-privacy-mode").addEventListener("click", () => switchMode(false));
  $("terms-current-mode").addEventListener("click", () => switchMode(true));
  $("terms-out").querySelectorAll("details.result-section").forEach((section) => {
    section.addEventListener("toggle", updateSummaryToggle);
  });
  $("terms-toggle-summaries").addEventListener("click", () => {
    const sections = visibleSections();
    const expand = sections.some((section) => !section.open);
    sections.forEach((section) => { section.open = expand; });
    updateSummaryToggle();
  });
  $("cancel-terms-analysis").addEventListener("click", () => controller?.abort());
  $("analyze-terms").addEventListener("click", async () => {
    resetResults();
    $("analyze-terms").disabled = true;
    $("cancel-terms-analysis").hidden = false;
    controller = new AbortController();
    try {
      let preferences = await settings.refresh();
      let categories = settings.enabledTerms(preferences).map(({ category }) => category);
      if (!categories.length) {
        showNoEnabledPreferences();
        return;
      }
      if (DEMO) {
        $("terms-result-label").textContent = "Sample analysis";
        render({
          ...DEMO_ANALYSIS,
          findings: DEMO_ANALYSIS.findings.filter(({ category }) => categories.includes(category)),
          unknowns: DEMO_ANALYSIS.unknowns.filter(({ category }) => categories.includes(category)),
        }, DEMO_TEXT);
        return;
      }
      show("terms-status", "Reading the open page…");
      const text = await pageText();
      if (controller.signal.aborted) {
        show("terms-status", "Analysis canceled.");
        return;
      }
      preferences = await settings.refresh();
      categories = settings.enabledTerms(preferences).map(({ category }) => category);
      if (controller.signal.aborted) {
        show("terms-status", "Analysis canceled.");
        return;
      }
      if (!categories.length) {
        showNoEnabledPreferences();
        return;
      }
      const analysis = await analyze(text, controller, categories, preferences);
      $("terms-status").hidden = true;
      render(analysis, text);
    } catch (error) {
      $("terms-status").hidden = true;
      if (controller.signal.aborted) {
        show("terms-status", "Analysis canceled.");
      } else {
        show("terms-error", error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.");
      }
    } finally {
      controller = null;
      $("cancel-terms-analysis").hidden = true;
      $("analyze-terms").disabled = false;
    }
  });
  if (DEMO) {
    $("terms-result-label").textContent = "Sample analysis";
    $("terms-privacy-note").textContent = "The demo preview does not send terms text.";
  }
})();
