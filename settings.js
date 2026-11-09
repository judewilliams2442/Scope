(() => {
  const PREFERENCE_KEY = "scope-preferences";
  const PREFERENCES = [
    {
      key: "locationTracking",
      category: "location_tracking",
      label: "Location and Tracking",
      icon: "📍",
      description: "Location data, GPS, geolocation, and other tracking practices.",
    },
    {
      key: "aiDataTraining",
      category: "ai_training",
      label: "AI Data Training",
      icon: "🤖",
      description: "Using user data to train or improve AI or machine-learning models.",
    },
    {
      key: "piiCollection",
      category: "pii_collection",
      label: "Personal Information Collection",
      icon: "ℹ️",
      description: "Collecting identifying details such as names, email, phone, or IP addresses.",
    },
    {
      key: "thirdPartySharing",
      category: "third_party_sharing",
      label: "Third-Party Sharing",
      icon: "👥",
      description: "Sharing, selling, or disclosing data to external entities.",
    },
    {
      key: "targetedAdvertising",
      category: "targeted_advertising",
      label: "Targeted Advertising",
      icon: "🎯",
      description: "Personalized ads, advertising profiles, and ad-network tracking.",
    },
    {
      key: "retentionDeletion",
      category: "retention_deletion",
      label: "Retention and Deletion",
      icon: "🗑️",
      description: "How long data is kept, deletion policies, and removal requests.",
    },
  ];
  const TERMS_PREFERENCES = [
    {
      key: "termsAccountTermination",
      category: "account_termination",
      label: "Account Termination and Suspension",
      icon: "🚫",
      description: "When the service or user may suspend or terminate access.",
    },
    {
      key: "termsPaymentFees",
      category: "payment_fees",
      label: "Payments, Fees, and Subscriptions",
      icon: "💵",
      description: "Charges, renewals, refunds, and cancellation terms.",
    },
    {
      key: "termsUserContentLicense",
      category: "user_content_license",
      label: "Your Content and Content License",
      icon: "📋",
      description: "Ownership and rights granted for content you submit.",
    },
    {
      key: "termsDisputeResolution",
      category: "dispute_resolution",
      label: "Disputes and Arbitration",
      icon: "🧑‍⚖️",
      description: "Dispute procedures, arbitration, and class-action waivers.",
    },
    {
      key: "termsLiabilityWarranty",
      category: "liability_warranty",
      label: "Warranties and Liability",
      icon: "📃",
      description: "Warranty disclaimers, liability limits, and excluded damages.",
    },
    {
      key: "termsGoverningLaw",
      category: "governing_law",
      label: "Governing Law and Jurisdiction",
      icon: "⚖️",
      description: "Which law, courts, or location govern disputes.",
    },
    {
      key: "termsUnilateralChanges",
      category: "unilateral_changes",
      label: "Changes to the Terms",
      icon: "📝",
      description: "How the terms may be changed and how users are notified.",
    },
  ];
  const ALL_PREFERENCES = [...PREFERENCES, ...TERMS_PREFERENCES];
  const DEFAULT_PREFERENCES = Object.fromEntries(
    ALL_PREFERENCES.map(({ key }) => [key, true])
  );
  const KEY_BY_CATEGORY = {
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
    account_termination: "termsAccountTermination",
    payment_fees: "termsPaymentFees",
    user_content_license: "termsUserContentLicense",
    dispute_resolution: "termsDisputeResolution",
    liability_warranty: "termsLiabilityWarranty",
    governing_law: "termsGoverningLaw",
    unilateral_changes: "termsUnilateralChanges",
  };

  let currentPreferences = { ...DEFAULT_PREFERENCES };
  let preferenceWrites = Promise.resolve();
  let onError = () => {};

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function normalizedPreferences(value) {
    if (Array.isArray(value)) {
      const selected = new Set(value.filter((item) => typeof item === "string"));
      return {
        ...Object.fromEntries(
          TERMS_PREFERENCES.map(({ key }) => [key, true])
        ),
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
      ALL_PREFERENCES.map(({ key }) => [
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
        ALL_PREFERENCES.every(({ key }) => typeof stored[key] === "boolean");
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
          !ALL_PREFERENCES.every(({ key }) =>
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
    } catch {
      throw new Error("Could not save your summary preferences.");
    }
  }

  function renderPreferenceGroup(containerId, preferenceGroup, preferences) {
    const container = document.getElementById(containerId);
    container.replaceChildren(
      ...preferenceGroup.map(({ key, category, label, description, icon }) => {
        const row = document.createElement("label");
        row.className = "preference";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "preference";
        checkbox.value = category;
        checkbox.checked = preferences[key];
        checkbox.setAttribute("aria-label", `${label}: include in summary`);
        checkbox.addEventListener("change", async () => {
          document.getElementById("settings-message").hidden = true;
          const previous = { ...currentPreferences };
          currentPreferences = { ...currentPreferences, [key]: checkbox.checked };
          document.querySelectorAll('#settings-view input[name="preference"]').forEach((input) => {
            input.disabled = true;
          });
          const write = preferenceWrites.then(() =>
            savePreferences(currentPreferences)
          );
          preferenceWrites = write.catch(() => {});
          try {
            await write;
            document.getElementById("preference-status").textContent =
              "Summary preferences saved on this device.";
          } catch (error) {
            currentPreferences = previous;
            renderPreferences(currentPreferences);
            onError(error instanceof Error
              ? error.message
              : "Could not save your summary preferences.");
          } finally {
            document.querySelectorAll('#settings-view input[name="preference"]').forEach((input) => {
              input.disabled = false;
            });
          }

        });

        const copy = document.createElement("span");
        copy.className = "preference-copy";
        const title = document.createElement("strong");
        if (icon) {
          const iconElement = document.createElement("span");
          iconElement.className = "preference-icon";
          iconElement.setAttribute("aria-hidden", "true");
          iconElement.textContent = icon;
          title.append(document.createTextNode(`${label} `), iconElement);
        } else {
          title.textContent = label;
        }
        const detail = document.createElement("small");
        detail.textContent = description;
        copy.append(title, detail);
        row.append(checkbox, copy);
        return row;
      })
    );
  }

  function renderPreferences(preferences) {
    renderPreferenceGroup("preferences", PREFERENCES, preferences);
    renderPreferenceGroup("terms-preferences", TERMS_PREFERENCES, preferences);
  }

  async function initialize(handleError) {
    onError = handleError;
    currentPreferences = await loadPreferences();
    renderPreferences(currentPreferences);
    return { ...currentPreferences };
  }

  async function refresh() {
    await preferenceWrites;
    currentPreferences = await loadPreferences();
    renderPreferences(currentPreferences);
    return { ...currentPreferences };
  }

  function enabled(preferences) {
    return PREFERENCES.filter(({ key }) => preferences[key]);
  }

  function disabled(preferences) {
    return PREFERENCES.filter(({ key }) => !preferences[key]);
  }

  function enabledTerms(preferences) {
    return TERMS_PREFERENCES.filter(({ key }) => preferences[key]);
  }

  function isCategoryEnabled(category, preferences) {
    const key = typeof category === "string"
      ? KEY_BY_CATEGORY[category]
      : undefined;
    return key !== undefined && preferences[key];
  }

  function filterByPreferences(items, preferences) {
    return items.filter((item) => isCategoryEnabled(item?.category, preferences));
  }

  globalThis.ScopeSettings = {
    initialize,
    refresh,
    enabled,
    disabled,
    enabledTerms,
    count: PREFERENCES.length,
    termsCount: TERMS_PREFERENCES.length,
    isCategoryEnabled,
    filterByPreferences,
  };
})();