# THE FINE PRINT
Hellar
*The machine reads the fine print. The judgment stays with you.*

A Chrome extension that reads the terms-of-service or privacy policy you're looking at and
hands you the material for an informed decision: what you're actually trading, whether your
content trains AI, what they take, who gets it, and the red flags — **every claim carrying an
exact quote from the document.** No quote, no claim.

This folder is your **starting skeleton**, built so your capstone starts from a working loop
instead of a blank page. What ships to real users is yours to build.

## Run it (2 minutes)

1. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → pick this folder.
3. Open any site's Terms of Service page, click the extension, enter the crew code
   (Mr. Turner has it), press **READ THIS PAGE'S TERMS**.

UI work without spending budget: open `popup.html?demo=1` in a plain tab — it renders a
canned analysis.

## How it works

- `popup.js` grabs the page's text **only when you press the button** (`activeTab` — the
  extension has no standing access to anything, which is the whole brand: the tool that
  audits data collection must collect nothing itself).
- The text goes to the school's AI gateway: `POST https://harness-ascte.netlify.app/api/fineprint`
  with `{code, device, url, text}`. The lane runs the analysis and returns JSON.
- The server **verifies every quote is verbatim** in the document before you ever see it —
  an invented quote gets stripped, never shown.
- Budget is real: ~1¢ per read, 40 reads per device per day, $5/month for the whole crew,
  and **every request is logged and readable by Mr. Turner.** The meter in the popup shows
  what each read cost. Spending a read is itself a judgment call.

## What's deliberately left for you (the actual capstone)

1. **The consent-moment card** — the analysis shouldn't live in a popup someone remembers
   to click. Detect the "I agree" moment and offer the card right there. (Careful: doing
   this without a standing content script on every page is the hard, interesting problem.)
2. **The diff** — "since you agreed in March, retention went from 30 days to forever."
   Store what a user agreed to (locally!) and compare on return visits.
3. **Better page extraction** — `document.body.innerText` is crude. Terms behind tabs,
   accordions, PDFs, and multi-page policies all defeat it today.
4. **Leave-ability actions** — a button that prefills the GDPR/CCPA deletion-request email.
5. **Real icons and a name of your own** — the placeholder icons are programmer art, and
   THE FINE PRINT is a working title. It's your product; name it.
6. **The Web Store listing** — privacy policy (easy: "we collect nothing"), screenshots,
   review process. Shipping is part of the work.
7. **Testing against the wild** — build a list of 20 real ToS pages, run them all, log where
   the analysis is wrong or thin, tune the prompt (in the lane) with Mr. Turner.

## The rules that ride along

- Your capstone requires journaling, crediting AI, and showing your own contributions.
  This README is the honest line: **the skeleton (lane + popup loop + quote-fence) existed
  on day one; everything in the list above is yours.** Keep that line true in your write-ups.
- The quote-fence is law: the extension never shows a claim about a document without the
  document's own sentence. If you add features, they inherit this rule.
- The lane rides the school's gateway on Mr. Turner's account — treat the budget like the
  shared resource it is.
