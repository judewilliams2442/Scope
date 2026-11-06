# Scope
*Understand the policy. Decide what works for you.*
A Chrome extension that analyzes the privacy policy open in your browser and presents the
available findings in plain language, with supporting policy excerpts where available.

## Run it (2 minutes)

1. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → pick this folder.
3. Use a current Chrome version. Open a site's privacy policy,
   click the Scope extension, and press **Analyze this page**.

Open `popup.html?demo=1` in a plain tab for a canned UI preview that does not make an API request.

## How it works

- `popup.js` grabs the open page's visible text **only when you press the button** (`activeTab`);
  it does not inspect pages in the background.
- `settings.js` manages the summary-preference controls and saved choices. `popup.html` loads it
  before `popup.js`, which uses the `ScopeSettings` API when preparing and filtering analysis.
- The popup's **Settings** button opens a separate preferences view, with a **Back** button to
  return to the main page. Analysis results stay hidden until the user presses **Analyze this page**.
- `popup.js` reads the visible page text only after the user presses Analyze, then sends it to
  the `/api/fineprint` function on your own configured Netlify site. It never sends policy text
  to the old harness service, never calls Mistral directly, and never contains the Mistral API key.
- `netlify/functions/fineprint.mjs` validates the request, checks the configured model context,
  sends one request to Mistral with the policy and only the selected categories, validates its
  JSON, and rejects supporting quotes that cannot be matched to the submitted text. Quote
  matching tolerates equivalent Unicode punctuation and whitespace, but returns the exact
  excerpt from the submitted text. It does not store policy text or results.
- The backend returns one evidence-backed finding or a not-found result for each requested
  category. If the model skips a category, the backend supplies a not-found result instead of
  failing the whole analysis. The popup validates the response again and displays only quotes
  found in the extracted page text. These checks do not guarantee that AI explanations are
  correct.
- The complete policy and selected categories are sent in one request; text is not chunked or
  truncated. Policies larger than 100,000 UTF-8 bytes or estimated to exceed the configured
  model's context are rejected with an error.

### Summary preferences

Open **Settings** to independently include or exclude location tracking, AI data
training, personal information collection, third-party sharing, targeted advertising, and
retention/deletion. All six are on for new users. Choices are stored as booleans in
`chrome.storage.local`; missing fields default to on while existing fields are preserved. The
popup also migrates the earlier saved priority list.

The backend analyzes only enabled topics. The enabled category list is sent with the policy; if
every category is off, Scope opens Settings and does not send the policy.

### Backend setup and deployment

The backend runs on Netlify Functions and uses Node.js 20 or newer. Install the Netlify CLI
(`npm.cmd install -g netlify-cli` from PowerShell) for local development.

Create or use a Netlify site that you control, and deploy this repository's
`netlify/functions/fineprint.mjs` function and `netlify.toml` redirect so `/api/fineprint` reaches
the function. The extension is intentionally configured with a placeholder URL; replace
`your-netlify-site` with your own Netlify site subdomain in both `API_ENDPOINT` in `popup.js` and
`host_permissions` in `manifest.json`. Configure these variables in your own Netlify site's
environment settings (local `.env` values are not deployed):

- `MISTRAL_API_KEY`: a server-side Mistral API key.
- `MISTRAL_MODEL`: an inference model available to that key, such as `ministral-3b-latest`.
- `SCOPE_ALLOWED_ORIGINS`: the exact extension origin, `chrome-extension://<extension-id>`.
- `MISTRAL_CONTEXT_TOKENS`: optional override only if the Mistral model listing does not return
  `max_context_length`; set it to the model's documented context limit.

For an unpacked extension, copy its ID from the card on `chrome://extensions` with Developer
mode enabled. Use the published extension ID for a store release.

For local Netlify development, configure `MISTRAL_API_KEY`, `MISTRAL_MODEL`, and
`SCOPE_ALLOWED_ORIGINS` in the ignored `.env` file (use `.env.example` as a reference without
overwriting an existing `.env`), then run `netlify.cmd dev`. Point `API_ENDPOINT` and the manifest
host permission to your local Netlify dev URL while testing, then restore your own deployed URL.

After configuring the Netlify environment variables, link your site with `netlify.cmd link` and
deploy with `netlify.cmd deploy --prod`, or push to its linked Git branch. Reload the unpacked
extension. Never commit `.env`.

To test the deployed endpoint manually from PowerShell (this sends the file to Mistral and may
incur usage charges):

```powershell
$body = @{ policy = Get-Content .\policy.txt -Raw } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://your-netlify-site.netlify.app/api/fineprint" `
  -Method Post -ContentType "application/json" -Body $body
```

The backend uses Mistral's documented [chat-completions API](https://docs.mistral.ai/api/) and
Bearer API-key authentication. It requests JSON mode and uses the selected model's context limit
when supplied by Mistral. The response budget is 4,096 tokens and is included in the conservative
context preflight; Mistral remains the final authority and may reject a request at its true
context limit. There is no chunking, because partial analysis could omit important policy terms.
The model-list and analysis requests share a 50-second total timeout, leaving time within
Netlify's documented 60-second synchronous function limit. Plan-specific limits may be lower.

The endpoint is publicly reachable by design so installed extensions can use it. CORS allowlists
browser extension origins but is not authentication against non-browser callers. Before broad
distribution, configure Netlify-level rate limits or another server-side abuse control to protect
the Mistral account quota.

### Manual verification

Run backend validation tests with `node --test test/fineprint.test.mjs`. They mock Mistral and do
not make paid API requests. Then verify manually:

1. Load the unpacked extension, open its popup, and check that all six preferences are on.
   Change one, close/reopen the popup, and confirm it remains off; reload Chrome and confirm
   it remains off.
2. With a policy containing several topics, disable one category and analyze. Confirm its
   findings and unknowns do not appear while enabled topics remain.
   Repeat with multiple disabled categories.
3. Turn off all six and analyze. Confirm Settings opens with a message and no request is sent.
4. Cancel during an analysis request and confirm the request stops.
5. Test a long policy. Confirm Scope sends it whole if it fits the byte and estimated context
   limits, and shows an actionable error otherwise.
6. Confirm evidence quotes match the source text and unaddressed enabled categories are not
   described as absent.
