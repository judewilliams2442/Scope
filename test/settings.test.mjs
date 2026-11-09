import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  setAttribute() {}
}

async function loadSettings(storedPreferences) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement() {
      return new Element();
    },
    createTextNode(text) {
      return text;
    },
    querySelectorAll() {
      return ["preferences", "terms-preferences"].flatMap((id) =>
        document.getElementById(id).children.map((row) => row.children[0])
      );
    },
  };
  const storage = {
    [storedPreferences ? "scope-preferences" : ""]: storedPreferences,
  };
  const chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(values) {
          Object.assign(storage, values);
        },
      },
    },
  };
  const source = await readFile(new URL("../settings.js", import.meta.url), "utf8");
  const context = { chrome, document };
  vm.runInNewContext(source, context);
  const preferences = await context.ScopeSettings.initialize(() => {});
  return { document, storage, settings: context.ScopeSettings, preferences };
}

test("renders separate policy and terms settings and saves them independently", async () => {
  const { document, storage, settings, preferences } = await loadSettings({
    locationTracking: false,
    aiDataTraining: true,
    piiCollection: true,
    thirdPartySharing: true,
    targetedAdvertising: true,
    retentionDeletion: true,
  });

  assert.equal(document.getElementById("preferences").children.length, 6);
  assert.equal(document.getElementById("terms-preferences").children.length, 7);
  assert.equal(preferences.locationTracking, false);
  assert.equal(preferences.termsAccountTermination, true);
  assert.equal(settings.enabledTerms(preferences).length, 7);

  const termsToggle = document.getElementById("terms-preferences").children[0].children[0];
  termsToggle.checked = false;
  await termsToggle.listeners.change();

  assert.equal(storage["scope-preferences"].termsAccountTermination, false);
  assert.equal(storage["scope-preferences"].locationTracking, false);
  assert.equal(settings.isCategoryEnabled("account_termination", storage["scope-preferences"]), false);
  assert.equal(settings.isCategoryEnabled("location_tracking", storage["scope-preferences"]), false);
});
