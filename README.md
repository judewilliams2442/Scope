# Scope
*Understand the policy. Decide what works for you.*
A Chrome extension that analyzes the privacy policy open in your browser and presents the
available findings in plain language, with supporting policy excerpts where available.

This folder is your **starting skeleton**, built so your capstone starts from a working loop
instead of a blank page. What ships to real users is yours to build.

## Run it (2 minutes)

1. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → pick this folder.
3. Use Chrome 138 or newer on a supported desktop device. Open a site's privacy policy,
   click the Scope extension, and press **Analyze this page**.

The first analysis may need to download Chrome's on-device model; the popup shows progress.
Open `popup.html?demo=1` in a plain tab for a canned UI preview that does not use the model.

## How it works

- `popup.js` grabs the open page's visible text **only when you press the button** (`activeTab`);
  it does not inspect pages in the background.
- `settings.js` manages the summary-preference controls and saved choices. `popup.html` loads it
  before `popup.js`, which uses the `ScopeSettings` API when preparing and filtering analysis.
- The popup's **Settings** button opens a separate preferences view, with a **Back** button to
  return to the main page. Analysis results stay hidden until the user presses **Analyze this page**.
- `popup.js` uses Chrome's built-in Prompt API (`LanguageModel`) to analyze the page text
  locally. Scope does not send policy text to its server; after model setup, analysis can work
  offline.
- The model prompt includes all category preferences and descriptions, instructs the model to
  treat policy text as untrusted, and requests categorized findings, unknowns, and verbatim
  evidence quotes in schema-constrained JSON.
- Scope validates the response, filters disabled topics again locally, and displays only quotes
  found verbatim in the extracted page text. These checks do not guarantee that AI explanations
  are correct.
- Long policies can exceed the model's context limit. Scope reports the error rather than
  silently truncating the policy.

### Summary preferences

Open **Settings** to independently include or exclude location tracking, AI data
training, personal information collection, third-party sharing, targeted advertising, and
retention/deletion. All six are on for new users. Choices are stored as booleans in
`chrome.storage.local`; missing fields default to on while existing fields are preserved. The
popup also migrates the earlier saved priority list.

Preferences are included in the Prompt API system prompt and applied again locally. If every
category is off, Scope opens Settings and does not initialize the model.

### Device and model availability

The Prompt API in Chrome extensions requires Chrome 138 or newer. Chrome's current documented
requirements include Windows 10/11, macOS 13+, Linux, or ChromeOS on Chromebook Plus; 22 GB free
space on the Chrome profile volume; and either more than 4 GB of GPU VRAM or at least 16 GB of
RAM and 4 CPU cores. Chrome on Android/iOS and non-Chromebook Plus ChromeOS are not supported.
Requirements and availability may change.

The model is downloaded separately and requires an unmetered connection for the initial
download. Chrome reports progress to the popup. Model use does not require network access
after setup. Chrome may remove the model when storage is low, so availability is checked for
each analysis. Consult the current [Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api)
and [built-in AI requirements](https://developer.chrome.com/docs/ai/get-started#requirements).

### Manual verification

There is no test framework in this starter extension. Verify manually:

1. Load the unpacked extension, open its popup, and check that all six preferences are on.
   Change one, close/reopen the popup, and confirm it remains off; reload Chrome and confirm
   it remains off.
2. With a policy containing several topics, disable one category and analyze. Confirm its
   findings and unknowns do not appear while enabled topics remain.
   Repeat with multiple disabled categories.
3. Turn off all six and analyze. Confirm Settings opens with a message and model initialization
   does not start.
4. On a device without a ready model, confirm availability/download status and progress.
   Cancel during model preparation or analysis.
5. Test a long policy that exceeds the model context. Confirm an actionable error appears and
   partial text is not presented as a complete analysis.
6. Confirm evidence quotes match the source text and unaddressed enabled categories are not
   described as absent.

## What's deliberately left for you (the actual capstone)

1. **The consent-moment card** — the analysis shouldn't live in a popup someone remembers
   to click. Detect the "I agree" moment and offer the card right there. (Careful: doing
   this without a standing content script on every page is the hard, interesting problem.)
2. **The diff** — "since you agreed in March, retention went from 30 days to forever."
   Store what a user agreed to (locally!) and compare on return visits.
3. **Better page extraction** — `document.body.innerText` is crude. Terms behind tabs,
   accordions, PDFs, and multi-page policies all defeat it today.
4. **Leave-ability actions** — a button that prefills the GDPR/CCPA deletion-request email.
5. **Real icons** — the placeholder icons are programmer art.
6. **The Web Store listing** — explain on-device analysis, the initial model download, and
   supported-device limitations. Shipping is part of the work.
7. **Testing against the wild** — build a list of 20 real privacy policies, run them all, log where
   the analysis is wrong or thin, and refine the on-device prompt.

## The rules that ride along

- Your capstone requires journaling, crediting AI, and showing your own contributions.
  This README is the honest line: **the starter popup flow and quote-fence existed
  on day one; everything in the list above is yours.** Keep that line true in your write-ups.
- Evidence shown by the extension must match text from the page. Local quote checks do not
  guarantee that every AI explanation is correct.
