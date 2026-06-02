# Self-Report Assessment Web-App

Five self-report questionnaires (PSQI, HADS, Lawton IADL, ESS, PHQ-9) presented
in random order, scored locally, exported as JSON + CSV. Rendering by SurveyJS
(free MIT runtime, vendored in `vendor/`, version `2.5.26`). No backend.

## Running it

Serve over http(s) so browser storage works reliably:

    python3 -m http.server 8000 --directory webapp
    # then open http://localhost:8000/

`?debug=1` pre-fills every item to test the flow quickly.

## Test-retest reliability

Each attendee completes the battery **twice on the same browser + device**
(not in private/incognito mode; do not clear site data between attempts). A
random, non-identifying token is stored in `localStorage` and written into each
export as `participantToken`, with `attempt` = 1 (baseline) or 2 (retest).
Pair the two exports by `participantToken` and compare per-scale scores
(e.g. ICC / Pearson). The token is an easy-to-read 5-letter code (e.g. `BAKOR`)
shown on the landing and completion screens so participants can confirm it is the
same on both visits.

- **Returning participant whose ID looks different** (e.g. a different device, or
  storage was cleared): they can type the ID from their first visit into
  "Returning? Enter your existing ID". Entry is case-insensitive and ignores
  punctuation/spaces; restoring an ID marks the session as a retest (attempt 2).
- "Not you? Start as a new participant" issues a fresh token on shared devices.

On completing a **second (or later) attempt on the same device**, the thank-you
screen shows a per-person comparison: each scale's visit-1 vs visit-2 score and
the change, plus an *illustrative* within-person consistency figure (Pearson r and
Spearman ρ across the 5 scale scores). This is a teaching aid, not a formal
statistic — a real test-retest reliability coefficient (ICC, etc.) is computed
across all participants from the collected CSVs in offline analysis. Prior-attempt
scores are kept in `localStorage`; the comparison only appears when the previous
attempt was completed in the same browser, and is cleared on reset / ID change.

Notes:
- The attempt counter is not capped: a third+ completion on the same browser is
  recorded with `attempt` ≥ 3, so do not assume `attempt ∈ {1, 2}` when analysing.
- In private/incognito mode `localStorage` does not persist: each session gets a
  fresh token and `attempt` resets to 1, so the two runs cannot be paired. Such
  exports carry `storagePersistent: false` — filter on it to exclude them.

## What gets exported

Each completed battery downloads two files named
`assessment-<token>-attempt<N>-<timestamp>.{json,csv}`:

- **JSON** — full detail: `participantToken`, `attempt`, `storagePersistent`,
  `timestamp`, `presentationOrder`, and per-instrument `responses` (item id +
  value + chosen label), `scores`, and `bands`.
- **CSV** — one wide row per session (leading `participantToken`, `attempt`,
  `storagePersistent`, `timestamp`, `presentationOrder`, then every item value,
  score, subscale/component, and band). Concatenate rows across attendees and
  pair attempts by token for analysis.

Scores are computed but **not shown to participants** (the completion screen is
a thank-you only). Scoring follows the official rules, including the PSQI
7-component algorithm (Buysse manual rev. 2005-05-20: 7 h sleep duration scores
1; Q5j contributes 0 if its value or comment is missing; efficiency clamped at
100%).

Approximate completion time for all five scales: **15–20 minutes**.

## Data collection (Google Sheets)

Each completed run is POSTed to a Google Apps Script web app that appends a
row to a central sheet (see `../apps-script/README.md` for the one-time setup).
The endpoint URL and a shared `formId` are injected at deploy time from the
GitHub Actions secrets `SHEET_ENDPOINT` and `SHEET_FORM_ID` — committed source
(`js/config.js`) holds placeholders only, because a static site cannot keep a
real secret. The Apps Script self-extends the sheet's columns by name, so the
randomised instrument order never misaligns them.

If submission fails (offline, endpoint down, or running locally without the
secrets), the completion screen reveals the local JSON/CSV download buttons and
auto-downloads a copy so no run is ever lost.

## Live reliability dashboard

`dashboard.html` is a self-refreshing D3 view of the collected data, meant for the
projector during the workshop. It reads the same sheet back through the Apps
Script's `doGet` (reusing the injected `SHEET_ENDPOINT`), polls every **20 s**, and
draws:

- **Test–retest** (primary): a **forest plot** of per-scale **ICC(2,1)** with 95% CI
  (two-way random, single rater, absolute agreement — the `irr::icc` "agreement"
  computation), plus a scale-selectable **scatter** (attempt 1 vs attempt 2, with the
  identity line) and **Bland–Altman** (mean vs difference, bias ± 1.96 SD).
- **Cross-instrument convergent**: scatter + standardised Bland–Altman for instruments
  sharing a construct — **HADS-Depression vs PHQ-9** and **PSQI vs ESS** — using each
  participant's first attempt.

All maths lives in `js/stats.js` (pure, unit-tested in `tests/stats.test.js`); charts
in `js/dashboard.js`; D3 v7 is vendored in `vendor/`. With no live endpoint (local dev
/ mis-deploy) the page falls back to `tests/fixtures/sample-rows.json`, so it renders
offline. The view is anonymous and aggregate — only the 5-letter token is used to pair
attempts.

> **One-time step:** the read-back needs the `doGet` added to `apps-script/Code.gs`.
> After adding it you must **re-deploy a new version** of the existing Apps Script
> deployment (keeping the same `/exec` URL). See `../apps-script/README.md`.

## Editing item content

Each scale is one file in `js/instruments/`. Edit the `text`/`options` there; the
adapter (`js/survey-adapter.js`) turns it into a SurveyJS page. Reload — no build.

## Updating SurveyJS

Re-download the three files in `vendor/` for a new pinned version:

    V=$(npm view survey-core version)
    curl -fsSL "https://unpkg.com/survey-core@${V}/survey-core.min.css" -o webapp/vendor/survey-core.min.css
    curl -fsSL "https://unpkg.com/survey-core@${V}/survey.core.min.js"  -o webapp/vendor/survey.core.min.js
    curl -fsSL "https://unpkg.com/survey-js-ui@${V}/survey-js-ui.min.js" -o webapp/vendor/survey-js-ui.min.js

Then update the version number noted above.

## Tests

    node --test webapp/tests/*.test.js

(Node 18+; this project was validated on Node 26. Use the glob form — a bare
directory argument is not auto-discovered on all Node versions.)
