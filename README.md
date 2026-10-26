# Scope
*Understand the policy. Decide what works for you.*
A Chrome extension that analyzes the privacy policy open in your browser and presents the
available findings in plain language, with supporting policy excerpts where available.

This folder is your **starting skeleton**, built so your capstone starts from a working loop
instead of a blank page. What ships to real users is yours to build.

## Run it (2 minutes)

1. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → pick this folder.
3. Open a site's privacy policy, click the Scope extension, enter the crew code
   (Mr. Turner has it), and press **Analyze this page**.

UI preview without spending budget: open `popup.html?demo=1` in a plain tab — it renders a
canned analysis. The preview is illustrative and does not analyze the current page.

## How it works

- `popup.js` grabs the open page's visible text **only when you press the button** (`activeTab`);
  it does not inspect pages in the background. That text is sent to the analysis gateway.
- The text goes to the school's AI gateway: `POST https://harness-ascte.netlify.app/api/fineprint`
  with `{code, device, url, text, priorities, enabledCategories, summaryInstructions}`.
  The popup accepts the legacy response and a structured `summary`, `findings`, and
  `unknowns` format.
- The popup checks displayed evidence excerpts against the extracted page text. The gateway
  should also verify quotations and ground claims before returning analysis.
- Budget is real: ~1¢ per read, 40 reads per device per day, $5/month for the whole crew,
  and **every request is logged and readable by Mr. Turner.** The meter in the popup shows
  what each read cost. Spending a read is itself a judgment call.

### Summary preferences

Open **Summary Preferences** to independently include or exclude location tracking, AI data
training, personal information collection, third-party sharing, targeted advertising, and
retention/deletion. All six are on for new users. Choices are stored as booleans in
`chrome.storage.local`; missing fields default to on while existing fields are preserved. The
popup also migrates the earlier saved priority list.

At the start of an analysis, the popup rereads saved choices and sends enabled category keys,
labels, and instructions to discuss only enabled topics, avoid claims about excluded topics,
and avoid inventing details. The UI filters categorized findings and unknowns locally, and
builds its overview only from those filtered results. Unstructured gateway summaries are not
displayed because the extension cannot safely remove disabled topics from free text. Legacy
fields are shown only when their response field maps to an enabled category; unclassified
legacy findings are omitted. If every category is off, no analysis request is sent.

The gateway and its model prompt are hosted outside this repository. They must honor the
`enabledCategories` and `summaryInstructions` request fields and return categorized findings
for full coverage, especially for location and advertising. A remote service that ignores
these fields may still analyze disabled topics internally; the popup suppresses unclassified
text but cannot guarantee model-side exclusion without a gateway update. The gateway should
also continue treating policy text as untrusted input and verifying quotations.

### Preference verification

There is no test framework in this starter extension. To verify the feature manually:

1. Load the unpacked extension, open its popup, and check that all six preferences are on.
   Change one, close/reopen the popup, and confirm it remains off; reload Chrome and confirm
   it remains off.
2. With a policy containing several topics, disable one category and analyze. Confirm tagged
   structured results for that category disappear while other enabled categories remain.
   Repeat with multiple disabled categories.
3. Turn off all six and analyze. Confirm the popup opens Summary Preferences with a clear
   message and makes no gateway request.
4. Confirm an enabled but unaddressed category is only described as unclear/not specified when
   the gateway returns a categorized unknown; the extension does not infer absence.
5. In DevTools, verify a partial saved preference object retains its boolean values and fills
   missing values as on. Verify the analysis request contains the latest enabled categories.
6. For overlapping topics, confirm the gateway returns separately categorized findings;
   unclassified legacy fields should be omitted rather than risking display of a disabled topic.

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
6. **The Web Store listing** — privacy policy explaining that page text is sent to the school's
   gateway only for user-initiated analysis and that requests are logged, screenshots,
   review process. Shipping is part of the work.
7. **Testing against the wild** — build a list of 20 real privacy policies, run them all, log where
   the analysis is wrong or thin, tune the prompt (in the lane) with Mr. Turner.

## The rules that ride along

- Your capstone requires journaling, crediting AI, and showing your own contributions.
  This README is the honest line: **the skeleton (lane + popup loop + quote-fence) existed
  on day one; everything in the list above is yours.** Keep that line true in your write-ups.
- Evidence shown by the extension must match text from the page. Keep that standard when
  adding features, and make sure the gateway grounds its claims as well.
- The lane rides the school's gateway on Mr. Turner's account — treat the budget like the
  shared resource it is.
