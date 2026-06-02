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
(e.g. ICC / Pearson). "Not you? Start as a new participant" issues a fresh token
on shared devices.

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
