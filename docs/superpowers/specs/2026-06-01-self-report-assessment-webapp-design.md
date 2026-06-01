# Self-Report Assessment Web-App — Design Spec

**Date:** 2026-06-01
**Project:** UKDRI SSRC workshop — participant self-report assessment battery
**Status:** Approved design (pending user spec review)

## 1. Purpose

A short, static web-app where workshop participants complete five self-report
assessments **in a randomised order**, with responses scored and exported as
downloadable files. No backend, no network calls, opens by double-clicking
`index.html`.

The five instruments (top self-report measures from the SSRC instrument-mining
analysis). Exact wording supplied by the user as scanned forms in `webapp/`:

| Instrument | Source PDF | Items | Response scale | Scoring |
|---|---|---|---|---|
| Pittsburgh Sleep Quality Index (PSQI) | `Pittsburgh Sleep Quality Index (PSQI).pdf` | 19 self-rated (Q1–Q9 scored) | mixed (times/minutes/hours + 0–3 Likert) | 7 components → global 0–21 |
| Hospital Anxiety and Depression Scale (HADS) | `HADS-PDF.pdf` | 14 | 0–3, item-specific anchors | Anxiety (7) + Depression (7), 0–21 each |
| Lawton-Brody Instrumental ADL (IADL) | `Lawton_IADL.pdf` | 8 categories | single-select, each option 0/1 | sum 0–8 |
| Epworth Sleepiness Scale (ESS) | `Epworth-Sleepiness-Scale.pdf` | 8 | 0–3 | sum 0–24 |
| Patient Health Questionnaire (PHQ-9) | `patient-health-questionnaire.pdf` | 9 | 0–3 | sum 0–27 |

**Copyright:** all five supplied versions permit non-commercial / educational /
research reproduction (PHQ-9: no permission required; Lawton: Hartford Institute
not-for-profit educational use; PSQI: non-commercial education & research;
ESS/HADS: standard reproduced clinical versions). Workshop use is within scope.

## 2. Key decisions (locked)

- **Delivery:** project folder, fully static, no build step, no run-time network
  calls. Lives in / extends the existing `webapp/` folder. Served over http(s)
  for the workshop (so `localStorage` is reliable).
- **Rendering library:** **SurveyJS** (free MIT runtime — `survey-core` +
  `survey-js-ui`), **vendored locally** into `webapp/vendor/` (works offline /
  on a locked-down network). SurveyJS handles rendering, mobile-responsive
  layout, accessibility, per-page required-field validation, progress bar, and
  the custom thank-you page. Loaded via plain `<script>` tags (no build step).
  Only the SurveyJS *form builder / PDF / dashboard* products are commercial —
  not used.
- **Custom logic kept on top of SurveyJS:** our own (unit-tested) scoring
  (`scoring.js`), pseudonymous token + attempt counter, page-order shuffle, and
  JSON/CSV export run in vanilla JS around SurveyJS — scoring/export consume
  `survey.data` (keyed by item id → numeric value).
- **Structure:** one config file per scale under `webapp/js/instruments/`,
  loaded via plain `<script>` tags using a **registry pattern** (each file calls
  `registerInstrument({...})`). A small adapter converts each config to a
  SurveyJS *page*. ES modules avoided to keep plain `<script>` loading and Node
  unit-testing simple.
- **Randomisation:** the array of instrument *pages* is shuffled with our
  Fisher–Yates `shuffle` before building the SurveyJS model (SurveyJS has no
  reliable native random-page-order flag); the chosen order is recorded.
- **Validation:** every scored question is `isRequired`; SurveyJS blocks
  `nextPage()` / completion until the current page is fully answered. PSQI time
  fields use `inputType:"time"`, numeric fields `inputType:"number"` with a
  `numeric` min-0 validator.
- **Item content:** fully supplied — each per-scale file contains the real item
  text and response options transcribed from the source PDF. No placeholders.
- **Order:** the 5 instruments shuffled (Fisher–Yates) per session.
- **Layout:** one scale per page (all its items on one scrollable page) with a
  progress indicator and a Next button.
- **Identity / test-retest (new):** the battery is filled **twice** per attendee
  to compute test-retest reliability. Sessions stay **anonymous** (no
  name/DOB/contact), but a **persistent pseudonymous token** links an attendee's
  two attempts:
  - On first visit, generate a random token (UUID-style, crypto-random) and
    store it client-side in **`localStorage`** (functions as the "cookie" — see
    note). The same token is reused on the return visit.
  - A completed-attempt counter is stored alongside it; each completed battery
    increments it. The submission records `attempt` (1 = baseline, 2 = retest,
    3+ allowed but flagged). The two attempts share the token → pairable for
    test-retest; order is independently re-randomised each attempt.
  - **Constraint (must communicate to attendees):** both attempts must be done
    in the **same browser on the same device**, not in private/incognito mode,
    without clearing site data. A shared device would conflate attendees — so
    the landing screen offers a **"Not you? Start as a new participant"** reset
    that issues a fresh token.
  - `localStorage` chosen over a cookie for a reliable, same-origin client store
    with a simple API; under `file://` some browsers restrict it, so for a
    multi-attendee workshop the app should be **served over http(s)** (a static
    host). Recorded in export: a flag if persistent storage was unavailable
    (token then falls back to per-session, breaking pairing — surfaced to user).
- **Within-session resume:** none — a refresh mid-battery restarts the current
  attempt (but keeps the persistent token).
- **Demographics:** the name/age/sex/initials/ID fields on the paper forms are
  **omitted** (sessions are anonymous; pairing uses the token, not identity).
- **PSQI bed-partner section:** Q10 and the partner-rated items (10a–e) are
  **omitted** — they are not scored and require a bed partner present.
- **Scoring:** computed for all scales; included in export.
- **Completion screen:** thank-you only — **no scores shown on screen**. Scores
  are still computed and written to the export files.
- **Export:** both **JSON** (full detail) and **CSV** (flat) downloaded.
- **Branding:** plain, neutral, accessible. No logos.

## 3. Project structure

```
webapp/
├── index.html                 # shell: SurveyJS container + thank-you buttons
├── css/
│   └── styles.css             # light overrides on top of SurveyJS theme
├── vendor/                    # SurveyJS runtime, vendored (pinned version)
│   ├── survey-core.min.css
│   ├── survey.core.min.js
│   └── survey-js-ui.min.js
├── js/
│   ├── scoring.js             # pure: sumScore, hadsSubscales, lawtonSum, psqiScore, bandFor + helpers
│   ├── survey-adapter.js      # toSurveyJson(defs, order): config → SurveyJS pages
│   ├── core.js                # registry, token store, shuffle, scoring dispatch, results + CSV builders; SurveyJS wiring
│   └── instruments/
│       ├── phq9.js            # registerInstrument({...})
│       ├── ess.js
│       ├── hads.js
│       ├── lawton-iadl.js
│       └── psqi.js
└── (the five source PDFs already present, kept for reference)
```

Load order in `index.html` (plain `<script>` tags, in order):
vendored `survey.core.min.js` → `survey-js-ui.min.js` → `scoring.js` →
each `instruments/*.js` → `survey-adapter.js` → `core.js` last (registry
populated and SurveyJS global present before the controller initialises).

## 4. Instrument config schema

Each `js/instruments/*.js` file contains exactly one `registerInstrument(...)`
call. The shape:

```js
registerInstrument({
  id: "phq9",
  name: "Patient Health Questionnaire (PHQ-9)",
  instructions: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  // Named, reusable response option sets. value = numeric points.
  responseSets: {
    freq: [
      { label: "Not at all", value: 0 },
      { label: "Several days", value: 1 },
      { label: "More than half the days", value: 2 },
      { label: "Nearly every day", value: 3 },
    ],
  },
  items: [
    { id: "phq9_1", text: "Little interest or pleasure in doing things",
      type: "choice", responseSet: "freq", subscale: "total" },
    // ...
  ],
  scoring: { rule: "sum", subscales: { total: { max: 27 } } },
});
```

Item `type` values:
- `"choice"` — radio buttons from a named `responseSet` (or item-specific
  inline `options`).
- `"text"` — free-text input (PSQI only): carries `format: "time"` (HH:MM,
  24h or AM/PM) or `format: "number"` (numeric, e.g. minutes / hours).

Where a scale's options differ per item (HADS, Lawton), the item carries its own
`options: [{label, value}, ...]` instead of referencing a shared `responseSet`.
This lets values be encoded **literally as printed on the form** — no reverse-
scoring flag is needed.

### Per-instrument content (from the supplied PDFs)

- **PHQ-9** — 9 `choice` items sharing the `freq` set (0–3). Items 1–9 verbatim
  from the form. The unscored functional-difficulty question is **not included**
  (it does not contribute to the total). `rule: "sum"`, total max 27.

- **ESS** — 8 `choice` items, shared set `0 = would never doze`,
  `1 = slight chance`, `2 = moderate chance`, `3 = high chance`. Situations
  verbatim (Sitting and reading; Watching TV; …; In a car, while stopped in
  traffic). `rule: "sum"`, total max 24.

- **HADS** — 14 `choice` items, each with its own `options` (literal values per
  the form). `subscale` tags each item `"anxiety"` (7) or `"depression"` (7).
  Item order follows the form's reading order (see §6 note). `rule:
  "hadsSubscales"`, each subscale max 21.

- **Lawton-Brody IADL** — 8 `choice` items (one per category A–H), each with its
  own `options` carrying the printed 0/1 value:
  - A. Telephone (4 opts: 1,1,1,0) · B. Shopping (4: 1,0,0,0) ·
    C. Food preparation (4: 1,0,0,0) · D. Housekeeping (5: 1,1,1,1,0) ·
    E. Laundry (3: 1,1,0) · F. Transportation (5: 1,1,1,0,0) ·
    G. Medications (3: 1,0,0) · H. Finances (3: 1,1,0).
  - `rule: "lawtonSum"`, total max 8. Scored across all 8 domains regardless of
    sex (the historical male 0–5 exclusion is not applied; recorded as a caveat
    in the export metadata).

- **PSQI** — see §5 for the item set and the full scoring algorithm.

## 5. Scoring engine (`scoring.js`)

Named, pure, independently testable functions referenced by config:

- `sum(items, responses)` — sum item values → one total (PHQ-9, ESS).
- `hadsSubscales(items, responses)` — sum per `subscale` tag → `{anxiety,
  depression}`.
- `lawtonSum(items, responses)` — sum the per-option 0/1 values → 0–8.
- `psqi(items, responses)` — the dedicated PSQI component algorithm below.

### PSQI items (scored set)

- `q1_bedtime` — text/time: usual bed time.
- `q2_latency_min` — text/number: minutes to fall asleep.
- `q3_risetime` — text/time: usual getting-up time.
- `q4_hours_sleep` — text/number: hours of actual sleep.
- `q5a`–`q5j` — 10 `choice` items, shared set:
  `Not during the past month=0`, `Less than once a week=1`,
  `Once or twice a week=2`, `Three or more times a week=3`.
  (5j includes an optional free-text "other reason" describe field — text is
  captured but only the frequency value is scored.)
- `q6_quality` — `choice`: `Very good=0`, `Fairly good=1`, `Fairly bad=2`,
  `Very bad=3`.
- `q7_medication` — `choice`, frequency set (0–3).
- `q8_stayawake` — `choice`, frequency set (0–3).
- `q9_enthusiasm` — `choice`: `No problem at all=0`, `Only a very slight
  problem=1`, `Somewhat of a problem=2`, `A very big problem=3`.

### PSQI scoring algorithm (official Buysse manual, rev. 2005-05-20)

All seven components yield 0–3; global = sum (0–21); cutoff: total ≤5 = good
sleep, total >5 = poor sleep. Components implemented exactly per the official
scoring manual:

1. **C1 Subjective sleep quality (SLPQUAL)** = `q6_quality` (0–3 directly).
2. **C2 Sleep latency (LATEN):**
   - Recode `q2_latency_min` → Q2new: ≤15→0, 16–30→1, 31–60→2, >60→3.
   - Sum Q2new + `q5a` → band: 0→0, 1–2→1, 3–4→2, 5–6→3.
3. **C3 Sleep duration (DURAT)** from `q4_hours_sleep`: **>7→0, 6–7→1, 5–6→2,
   <5→3.** Implemented as `>7→0, >6→1, >5→2, else→3` so 7 h scores 1, 6 h scores
   2, 5 h scores 3 (per the manual — note 7 h is **not** 0).
4. **C4 Habitual sleep efficiency (HSE):**
   - `diffsec` = seconds between `q1_bedtime` and `q3_risetime`;
     `diffhour = |diffsec| / 3600`; `newtib = diffhour − 24` if `diffhour > 24`
     else `diffhour` (i.e. hours in bed across the overnight wrap).
   - `efficiency% = (q4_hours_sleep / newtib) × 100`.
   - ≥85→0, 75–84→1, 65–74→2, <65→3.
   - Edge cases: clamp efficiency at 100% if hours-slept > time-in-bed; guard
     against `newtib ≤ 0`.
5. **C5 Sleep disturbances (DISTB):** sum `q5b`…`q5j` (9 items).
   **Q5j rule (2005 revision):** if the Q5j frequency *or* its "other reason"
   describe text is missing, set Q5j = 0. Sum → band: 0→0, 1–9→1, 10–18→2,
   19–27→3.
6. **C6 Use of sleeping medication (MEDS)** = `q7_medication` (0–3 directly).
7. **C7 Daytime dysfunction (DAYDYS):** `q8_stayawake` + `q9_enthusiasm`.
   Sum → band: 0→0, 1–2→1, 3–4→2, 5–6→3.

### Severity bands (recorded in export; not shown on screen)

- **PHQ-9:** 0–4 minimal, 5–9 mild, 10–14 moderate, 15–19 mod-severe, 20–27 severe.
- **ESS** (this NHS version): ≤10 normal, 11–12 borderline, ≥13 abnormal
  (resolving the form's overlapping printed boundaries).
- **HADS** (per subscale): 0–7 normal, 8–10 borderline, 11–21 case.
- **PSQI:** ≤5 good sleep, >5 poor sleep.
- **Lawton IADL:** raw 0–8 (higher = more independent); no standard band → raw only.

## 6. Application flow (`core.js`)

1. **Landing screen** — title, short neutral intro, "Begin" button.
   - On load: read or create the persistent token + attempt counter in
     `localStorage`. Show which attempt this will be ("Attempt 2 of 2 — thanks
     for returning") and the **"Not you? Start as a new participant"** reset.
   - If persistent storage is unavailable, show a brief notice that test-retest
     pairing may not work, and set the storage-unavailable export flag.
2. On Begin — Fisher–Yates shuffle of registered instruments → page order
   (re-randomised independently for each attempt); adapter builds the SurveyJS
   model with one page per instrument, then `survey.render(container)`.
3. **Scale pages** — SurveyJS renders one instrument per page (instructions +
   all its items), with a top progress bar. The native **Next** button calls
   `nextPage()`, which enforces `isRequired` validation (all items answered;
   time/number fields valid) before advancing — SurveyJS shows the inline error
   and focuses the offending question.
4. On `onComplete` → read `survey.data`, compute all scores, then **increment
   the attempt counter** in `localStorage`.
5. **Completion** — SurveyJS `completedHtml` shows a thank-you message only (no
   scores) with two buttons; clicking triggers the JSON / CSV downloads.
   Filenames include the token + attempt.
6. Refresh at any point → back to landing (no within-attempt persistence; the
   persistent token is retained).

**HADS item order:** transcribed in the form's reading order (left-column items
1–7, then right-column items 8–14), each tagged anxiety/depression. Item order
within a page does not affect scoring (subscale tags drive it), but is preserved
for fidelity to the source form.

## 7. Export

Results object assembled at completion:

```json
{
  "participantToken": "p_8f3c1a9e-…",
  "attempt": 2,
  "storagePersistent": true,
  "timestamp": "2026-06-01T14:32:10.000Z",
  "presentationOrder": ["hads", "psqi", "ess", "lawton-iadl", "phq9"],
  "instruments": {
    "phq9": {
      "responses": [ { "itemId": "phq9_1", "value": 2, "label": "More than half the days" } ],
      "scores": { "total": 14 },
      "bands": { "total": "moderate" }
    },
    "psqi": {
      "responses": [ { "itemId": "q1_bedtime", "value": "23:00" }, "..." ],
      "scores": { "c1": 1, "c2": 2, "c3": 1, "c4": 0, "c5": 1, "c6": 0, "c7": 1, "global": 6 },
      "bands": { "global": "poor sleep" }
    }
  }
}
```

- **JSON file:** `assessment-<token>-attempt<N>-<timestamp>.json` — full object.
- **CSV file:** `assessment-<token>-attempt<N>-<timestamp>.csv` — one wide row:
  `participantToken`, `attempt`, `storagePersistent`, presentation order, every
  item value, every computed score/subscale/component, every band. Stable,
  machine-friendly headers. Pair rows by `participantToken` and compare
  `attempt` 1 vs 2 to compute test-retest reliability (e.g. ICC / Pearson per
  scale score).

## 8. Error handling & testing

- Unanswered-item guard handled by SurveyJS `isRequired` + `nextPage()`
  validation (choice + time/number inputs).
- PSQI free-text time/number parsing validated again in scoring; invalid/missing
  values degrade gracefully (treated per the manual). Overnight bed→rise wrap
  handled in C4; efficiency clamped at 100%.
- `?debug=1` URL flag: programmatically sets `survey.data` with valid random
  responses, to exercise flow → scoring → export quickly without manual entry.
- **Unit tests (Node `node --test`, no deps):** all pure logic is tested —
  `scoring.js` (every rule incl. a PSQI worked example covering all 7
  components, the Q5j-missing rule, efficiency clamp), the config files
  (structural validation: item counts, option values), the `survey-adapter`
  (config → SurveyJS page mapping), and `core.js` pure functions (token,
  attempt, shuffle invariants, results + CSV builders).
- **End-to-end:** Playwright (webapp-testing) drives the served app with
  `?debug=1` through all five pages to the thank-you screen and verifies both
  downloads + JSON shape.

## 9. Out of scope (YAGNI)

- No backend, accounts, or server-side storage.
- No resume / partial-save across refresh.
- No multi-language support.
- No demographic capture; no PSQI bed-partner section.
- No on-screen scoring/clinical interpretation for participants.

## 10. Verification items (during implementation)

1. PSQI C4 efficiency edge cases: overnight wrap, hours-slept > time-in-bed
   (clamp efficiency at 100%), zero/invalid time-in-bed.
2. HADS per-option values transcribed exactly as printed (values are literal,
   direction varies per item).
3. Lawton per-category option→value mapping matches the form (some categories
   have multiple options scoring 1).
4. ESS band boundary resolution (overlapping printed ranges) confirmed as
   ≤10 / 11–12 / ≥13.
5. Persistent token: `localStorage` read/write works under the intended host;
   reset flow issues a fresh token; storage-unavailable fallback sets the export
   flag and warns the user. Token is non-identifying (random, no PII).
6. Test-retest pairing assumes same browser/device across both attempts —
   documented for the workshop facilitator (e.g. in a short "how to run it"
   note).
