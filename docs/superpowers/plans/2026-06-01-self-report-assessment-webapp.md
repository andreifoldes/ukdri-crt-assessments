# Self-Report Assessment Web-App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, dependency-free web-app where workshop participants complete five self-report assessments (PSQI, HADS, Lawton IADL, ESS, PHQ-9) in randomised order, with scores computed and exported as JSON+CSV, and a persistent pseudonymous token linking each attendee's two attempts for test-retest reliability.

**Architecture:** Static `webapp/index.html` loads plain `<script>` tags (no build step). **SurveyJS** (free MIT runtime, vendored locally) renders the questionnaires — mobile layout, accessibility, per-page required-field validation, progress bar, custom thank-you page. Our own code sits on top: pure scoring (`scoring.js`), an adapter that turns each instrument config into a SurveyJS page (`survey-adapter.js`), and `core.js` (registry, persistent-token store, Fisher–Yates page shuffle, scoring dispatch, JSON/CSV export, and the SurveyJS wiring). Each instrument is a data-only config calling `registerInstrument(...)`. All pure logic is dual-exported so it unit-tests under Node.

**Tech Stack:** Vanilla HTML/CSS/JS (ES2017) + SurveyJS (`survey-core` + `survey-js-ui`, vendored, pinned version). Unit tests run with Node's built-in runner (`node --test`, no dependencies); end-to-end via Playwright (webapp-testing). Source forms in `webapp/*.pdf` (already present) are the authoritative content + scoring source. Design spec: `docs/superpowers/specs/2026-06-01-self-report-assessment-webapp-design.md`.

**Note on Tasks 1–12:** these (scoring functions, instrument configs, pure `core.js` logic) are unchanged by the SurveyJS decision — they are framework-agnostic and Node-tested. SurveyJS only affects rendering (new Tasks 13–17). In `core.js`, `buildResults` consumes a per-instrument responses map; the SurveyJS controller (Task 15) produces that map by splitting `survey.data` (flat `{itemId: value}`) using each instrument's item ids.

---

## File Structure

```
webapp/
├── index.html                 # SurveyJS container + thank-you download buttons
├── css/styles.css             # light overrides on the SurveyJS theme
├── vendor/                    # SurveyJS runtime, vendored (pinned version)
│   ├── survey-core.min.css
│   ├── survey.core.min.js
│   └── survey-js-ui.min.js
├── js/
│   ├── scoring.js             # pure: sumScore, hadsSubscales, lawtonSum, psqiScore, bandFor + helpers
│   ├── survey-adapter.js      # toSurveyJson(defs, order): config → SurveyJS pages
│   ├── core.js                # registry, token store, shuffle, scoring dispatch, results+CSV builders, SurveyJS wiring
│   └── instruments/
│       ├── phq9.js            # registerInstrument({...})
│       ├── ess.js
│       ├── hads.js
│       ├── lawton-iadl.js
│       └── psqi.js
├── tests/
│   ├── scoring.test.js        # node --test: scoring functions
│   ├── instruments.test.js    # node --test: config structural validation
│   ├── adapter.test.js        # node --test: config → SurveyJS page mapping
│   └── core.test.js           # node --test: token/attempt + export builder + shuffle invariants
└── README.md                  # how to host/run + same-device test-retest note
```

**Module/test convention:** every `js/*.js` file is wrapped so it exposes its API
as a browser global *and* as a Node `module.exports`. Test files are CommonJS
(`tests/*.test.js`) and `require()` the source directly. There is **no
`package.json`** in `webapp/` (so Node treats `.js` as CommonJS). Run all tests
with `node --test webapp/tests/*.test.js`.

The dual-export wrapper used by every source file:

```js
(function (global) {
  // ... definitions ...
  const API = { /* exported names */ };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);   // attaches names to window
})(typeof window !== "undefined" ? window : globalThis);
```

---

## Task 1: Scaffold folders + scoring.js skeleton + passing test harness

**Files:**
- Create: `webapp/js/scoring.js`
- Create: `webapp/tests/scoring.test.js`

- [ ] **Step 1: Write the failing test**

`webapp/tests/scoring.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/scoring.js");

test("scoring module exposes expected functions", () => {
  for (const name of ["sumScore", "hadsSubscales", "lawtonSum", "psqiScore", "bandFor", "parseTimeToMinutes", "hoursInBed"]) {
    assert.equal(typeof S[name], "function", `${name} should be a function`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/scoring.test.js`
Expected: FAIL — `Cannot find module '../js/scoring.js'`.

- [ ] **Step 3: Write minimal implementation**

`webapp/js/scoring.js`:

```js
(function (global) {
  "use strict";

  function sumScore(items, responses) { return 0; }
  function hadsSubscales(items, responses) { return { anxiety: 0, depression: 0 }; }
  function lawtonSum(items, responses) { return 0; }
  function psqiScore(responses) { return { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, global: 0 }; }
  function bandFor(instrumentId, scores) { return {}; }
  function parseTimeToMinutes(str) { return null; }
  function hoursInBed(bedStr, riseStr) { return null; }

  const API = { sumScore, hadsSubscales, lawtonSum, psqiScore, bandFor, parseTimeToMinutes, hoursInBed };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/scoring.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add webapp/js/scoring.js webapp/tests/scoring.test.js
git commit -m "chore: scaffold webapp scoring module + node test harness"
```

---

## Task 2: `sumScore` (PHQ-9, ESS)

**Files:**
- Modify: `webapp/js/scoring.js`
- Modify: `webapp/tests/scoring.test.js`

`sumScore(items, responses)` sums the numeric value chosen for each item.
`responses` is a plain object `{ [itemId]: number }`.

- [ ] **Step 1: Write the failing test** (append to `scoring.test.js`)

```js
test("sumScore adds the chosen numeric values across items", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const responses = { a: 3, b: 0, c: 2 };
  assert.equal(S.sumScore(items, responses), 5);
});

test("sumScore treats a missing response as 0", () => {
  const items = [{ id: "a" }, { id: "b" }];
  assert.equal(S.sumScore(items, { a: 2 }), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/scoring.test.js`
Expected: FAIL — `sumScore` returns 0, expected 5.

- [ ] **Step 3: Write minimal implementation** (replace the `sumScore` stub)

```js
function sumScore(items, responses) {
  return items.reduce((total, item) => {
    const v = responses[item.id];
    return total + (Number.isFinite(v) ? v : 0);
  }, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/scoring.js webapp/tests/scoring.test.js
git commit -m "feat(scoring): implement sumScore for PHQ-9/ESS"
```

---

## Task 3: `hadsSubscales` (HADS anxiety/depression)

**Files:**
- Modify: `webapp/js/scoring.js`
- Modify: `webapp/tests/scoring.test.js`

Sums each item's value into its `subscale` bucket (`"anxiety"` or `"depression"`).

- [ ] **Step 1: Write the failing test**

```js
test("hadsSubscales sums values by subscale tag", () => {
  const items = [
    { id: "h1", subscale: "anxiety" },
    { id: "h2", subscale: "depression" },
    { id: "h3", subscale: "anxiety" },
    { id: "h4", subscale: "depression" },
  ];
  const responses = { h1: 3, h2: 1, h3: 2, h4: 0 };
  assert.deepEqual(S.hadsSubscales(items, responses), { anxiety: 5, depression: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/scoring.test.js`
Expected: FAIL — returns `{anxiety:0, depression:0}`.

- [ ] **Step 3: Write minimal implementation**

```js
function hadsSubscales(items, responses) {
  const out = { anxiety: 0, depression: 0 };
  for (const item of items) {
    const v = responses[item.id];
    if (Number.isFinite(v) && (item.subscale === "anxiety" || item.subscale === "depression")) {
      out[item.subscale] += v;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/scoring.js webapp/tests/scoring.test.js
git commit -m "feat(scoring): implement hadsSubscales"
```

---

## Task 4: `lawtonSum` (Lawton IADL)

**Files:**
- Modify: `webapp/js/scoring.js`
- Modify: `webapp/tests/scoring.test.js`

Each Lawton item's chosen option carries a 0/1 value; the score is their sum (0–8).

- [ ] **Step 1: Write the failing test**

```js
test("lawtonSum sums the 0/1 option values across 8 categories", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: "L" + i }));
  const responses = { L0: 1, L1: 1, L2: 0, L3: 1, L4: 1, L5: 1, L6: 0, L7: 1 };
  assert.equal(S.lawtonSum(items, responses), 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/scoring.test.js`
Expected: FAIL — returns 0.

- [ ] **Step 3: Write minimal implementation**

```js
function lawtonSum(items, responses) {
  return sumScore(items, responses);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/scoring.js webapp/tests/scoring.test.js
git commit -m "feat(scoring): implement lawtonSum"
```

---

## Task 5: PSQI time helpers (`parseTimeToMinutes`, `hoursInBed`)

**Files:**
- Modify: `webapp/js/scoring.js`
- Modify: `webapp/tests/scoring.test.js`

`parseTimeToMinutes` accepts `"23:00"`, `"7:00"`, `"11:00 PM"`, `"7:30am"` →
minutes since midnight, else `null`. `hoursInBed` computes the forward
difference bed→rise across the overnight wrap (per the official manual:
`diffhour = |diffsec|/3600`; subtract 24 if `> 24`).

- [ ] **Step 1: Write the failing test**

```js
test("parseTimeToMinutes handles 24h and AM/PM", () => {
  assert.equal(S.parseTimeToMinutes("23:00"), 23 * 60);
  assert.equal(S.parseTimeToMinutes("07:00"), 7 * 60);
  assert.equal(S.parseTimeToMinutes("11:00 PM"), 23 * 60);
  assert.equal(S.parseTimeToMinutes("7:30am"), 7 * 60 + 30);
  assert.equal(S.parseTimeToMinutes("12:00 AM"), 0);
  assert.equal(S.parseTimeToMinutes("12:00 PM"), 12 * 60);
});

test("parseTimeToMinutes rejects junk", () => {
  assert.equal(S.parseTimeToMinutes(""), null);
  assert.equal(S.parseTimeToMinutes("banana"), null);
  assert.equal(S.parseTimeToMinutes("25:00"), null);
});

test("hoursInBed computes forward overnight difference", () => {
  assert.equal(S.hoursInBed("23:00", "07:00"), 8);   // wraps midnight
  assert.equal(S.hoursInBed("22:30", "06:30"), 8);
  assert.equal(S.hoursInBed("01:00", "09:00"), 8);   // same calendar day
  assert.equal(S.hoursInBed("23:00", "23:00"), 24);  // edge: equal times → 24h
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/scoring.test.js`
Expected: FAIL — helpers return null.

- [ ] **Step 3: Write minimal implementation** (replace both stubs)

```js
function parseTimeToMinutes(str) {
  if (typeof str !== "string") return null;
  const s = str.trim().toLowerCase();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3];
  if (min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === "am") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h > 23) return null;
  return h * 60 + min;
}

function hoursInBed(bedStr, riseStr) {
  const bed = parseTimeToMinutes(bedStr);
  const rise = parseTimeToMinutes(riseStr);
  if (bed === null || rise === null) return null;
  let diff = rise - bed;                 // minutes
  if (diff <= 0) diff += 24 * 60;        // overnight wrap; equal times → 24h
  return diff / 60;                      // hours
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/scoring.js webapp/tests/scoring.test.js
git commit -m "feat(scoring): PSQI time-parsing helpers"
```

---

## Task 6: `psqiScore` — the 7 components + global

**Files:**
- Modify: `webapp/js/scoring.js`
- Modify: `webapp/tests/scoring.test.js`

Implements the official Buysse manual (rev. 2005-05-20). `responses` is a map
with keys: `q1_bedtime` (time string), `q2_latency_min` (number), `q3_risetime`
(time string), `q4_hours_sleep` (number), `q5a`…`q5j` (0–3), `q5j_text`
(string, optional), `q6_quality`, `q7_medication`, `q8_stayawake`,
`q9_enthusiasm` (0–3).

- [ ] **Step 1: Write the failing test** (worked example covering all 7 components)

```js
test("psqiScore computes all 7 components + global (worked example)", () => {
  const r = {
    q1_bedtime: "23:00", q3_risetime: "07:00",   // 8h in bed
    q2_latency_min: 20,                            // Q2new = 1
    q4_hours_sleep: 7,                             // DURAT: >6 → 1; eff = 7/8 = 87.5% → 0
    q5a: 1,                                        // LATEN sum = 1+1 = 2 → 1
    q5b: 1, q5c: 1, q5d: 1, q5e: 1, q5f: 1, q5g: 1, q5h: 1, q5i: 1, // 8
    q5j: 2, q5j_text: "noise",                     // counted → DISTB sum = 10 → 2
    q6_quality: 1,                                 // SLPQUAL = 1
    q7_medication: 0,                              // MEDS = 0
    q8_stayawake: 1, q9_enthusiasm: 1,             // DAYDYS sum = 2 → 1
  };
  const s = S.psqiScore(r);
  assert.equal(s.c1, 1, "C1 SLPQUAL");
  assert.equal(s.c2, 1, "C2 LATEN");
  assert.equal(s.c3, 1, "C3 DURAT");
  assert.equal(s.c4, 0, "C4 HSE");
  assert.equal(s.c5, 2, "C5 DISTB");
  assert.equal(s.c6, 0, "C6 MEDS");
  assert.equal(s.c7, 1, "C7 DAYDYS");
  assert.equal(s.global, 6, "global = sum of components");
});

test("psqiScore sets Q5j to 0 when its comment text is missing", () => {
  const base = {
    q1_bedtime: "23:00", q3_risetime: "07:00", q2_latency_min: 20, q4_hours_sleep: 7,
    q5a: 1, q5b: 1, q5c: 1, q5d: 1, q5e: 1, q5f: 1, q5g: 1, q5h: 1, q5i: 1,
    q5j: 3,                       // value present but NO q5j_text → treated as 0
    q6_quality: 1, q7_medication: 0, q8_stayawake: 1, q9_enthusiasm: 1,
  };
  const s = S.psqiScore(base);
  assert.equal(s.c5, 1, "DISTB sum = 8 (q5j ignored) → band 1");
});

test("psqiScore clamps efficiency above 100%", () => {
  const r = {
    q1_bedtime: "23:00", q3_risetime: "06:00",   // 7h in bed
    q2_latency_min: 5, q4_hours_sleep: 8,         // slept > in bed → clamp 100% → C4 = 0
    q5a: 0, q5b: 0, q5c: 0, q5d: 0, q5e: 0, q5f: 0, q5g: 0, q5h: 0, q5i: 0, q5j: 0,
    q6_quality: 0, q7_medication: 0, q8_stayawake: 0, q9_enthusiasm: 0,
  };
  assert.equal(S.psqiScore(r).c4, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/scoring.test.js`
Expected: FAIL — `psqiScore` returns all zeros, global 0 ≠ 6.

- [ ] **Step 3: Write minimal implementation** (replace the `psqiScore` stub; uses `hoursInBed`)

```js
function _num(v) { return Number.isFinite(v) ? v : (Number.isFinite(+v) ? +v : null); }

function _bandFromSum(sum, b1, b2, b3) {
  // 0 -> 0; [1..b1] -> 1; [b1+1..b2] -> 2; [b2+1..b3] -> 3
  if (sum <= 0) return 0;
  if (sum <= b1) return 1;
  if (sum <= b2) return 2;
  return 3;
}

function psqiScore(responses) {
  const r = responses || {};

  // C1 — subjective sleep quality
  const c1 = _num(r.q6_quality) || 0;

  // C2 — sleep latency
  const q2 = _num(r.q2_latency_min);
  let q2new;
  if (q2 === null) q2new = 0;
  else if (q2 <= 15) q2new = 0;
  else if (q2 <= 30) q2new = 1;
  else if (q2 <= 60) q2new = 2;
  else q2new = 3;
  const c2 = _bandFromSum(q2new + (_num(r.q5a) || 0), 2, 4, 6);

  // C3 — sleep duration (note: 7h scores 1, not 0)
  const q4 = _num(r.q4_hours_sleep);
  let c3;
  if (q4 === null) c3 = 0;
  else if (q4 > 7) c3 = 0;
  else if (q4 > 6) c3 = 1;
  else if (q4 > 5) c3 = 2;
  else c3 = 3;

  // C4 — habitual sleep efficiency
  const tib = hoursInBed(r.q1_bedtime, r.q3_risetime);
  let c4 = 0;
  if (tib && tib > 0 && q4 !== null) {
    let eff = (q4 / tib) * 100;
    if (eff > 100) eff = 100;                 // clamp
    if (eff >= 85) c4 = 0;
    else if (eff >= 75) c4 = 1;
    else if (eff >= 65) c4 = 2;
    else c4 = 3;
  }

  // C5 — sleep disturbances (q5b..q5j; q5j = 0 if value OR comment missing)
  const distbKeys = ["q5b", "q5c", "q5d", "q5e", "q5f", "q5g", "q5h", "q5i"];
  let distbSum = distbKeys.reduce((t, k) => t + (_num(r[k]) || 0), 0);
  const q5j = _num(r.q5j);
  const q5jText = typeof r.q5j_text === "string" ? r.q5j_text.trim() : "";
  if (q5j !== null && q5jText !== "") distbSum += q5j;   // else Q5j contributes 0
  const c5 = _bandFromSum(distbSum, 9, 18, 27);

  // C6 — use of sleeping medication
  const c6 = _num(r.q7_medication) || 0;

  // C7 — daytime dysfunction
  const c7 = _bandFromSum((_num(r.q8_stayawake) || 0) + (_num(r.q9_enthusiasm) || 0), 2, 4, 6);

  const global = c1 + c2 + c3 + c4 + c5 + c6 + c7;
  return { c1, c2, c3, c4, c5, c6, c7, global };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/scoring.test.js`
Expected: PASS (all PSQI tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/js/scoring.js webapp/tests/scoring.test.js
git commit -m "feat(scoring): implement PSQI 7-component scoring per official manual"
```

---

## Task 7: `bandFor` — severity bands per instrument

**Files:**
- Modify: `webapp/js/scoring.js`
- Modify: `webapp/tests/scoring.test.js`

`bandFor(instrumentId, scores)` returns a map of band labels (recorded in
export; not shown to participants).

- [ ] **Step 1: Write the failing test**

```js
test("bandFor returns correct severity labels", () => {
  assert.deepEqual(S.bandFor("phq9", { total: 0 }), { total: "minimal" });
  assert.deepEqual(S.bandFor("phq9", { total: 7 }), { total: "mild" });
  assert.deepEqual(S.bandFor("phq9", { total: 12 }), { total: "moderate" });
  assert.deepEqual(S.bandFor("phq9", { total: 17 }), { total: "moderately severe" });
  assert.deepEqual(S.bandFor("phq9", { total: 22 }), { total: "severe" });

  assert.deepEqual(S.bandFor("ess", { total: 9 }), { total: "normal" });
  assert.deepEqual(S.bandFor("ess", { total: 11 }), { total: "borderline" });
  assert.deepEqual(S.bandFor("ess", { total: 15 }), { total: "abnormal" });

  assert.deepEqual(S.bandFor("hads", { anxiety: 5, depression: 9 }),
    { anxiety: "normal", depression: "borderline" });
  assert.deepEqual(S.bandFor("hads", { anxiety: 14, depression: 2 }),
    { anxiety: "case", depression: "normal" });

  assert.deepEqual(S.bandFor("psqi", { global: 5 }), { global: "good sleep" });
  assert.deepEqual(S.bandFor("psqi", { global: 6 }), { global: "poor sleep" });

  assert.deepEqual(S.bandFor("lawton", { total: 4 }), { total: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/scoring.test.js`
Expected: FAIL — `bandFor` returns `{}`.

- [ ] **Step 3: Write minimal implementation** (replace the `bandFor` stub)

```js
function _phq9Band(t) {
  if (t <= 4) return "minimal";
  if (t <= 9) return "mild";
  if (t <= 14) return "moderate";
  if (t <= 19) return "moderately severe";
  return "severe";
}
function _essBand(t) {
  if (t <= 10) return "normal";
  if (t <= 12) return "borderline";
  return "abnormal";
}
function _hadsBand(t) {
  if (t <= 7) return "normal";
  if (t <= 10) return "borderline";
  return "case";
}

function bandFor(instrumentId, scores) {
  switch (instrumentId) {
    case "phq9": return { total: _phq9Band(scores.total) };
    case "ess":  return { total: _essBand(scores.total) };
    case "hads": return { anxiety: _hadsBand(scores.anxiety), depression: _hadsBand(scores.depression) };
    case "psqi": return { global: scores.global > 5 ? "poor sleep" : "good sleep" };
    case "lawton": return { total: null };  // no standard band
    default: return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/scoring.js webapp/tests/scoring.test.js
git commit -m "feat(scoring): severity bands per instrument"
```

---

## Task 8: Registry shim + PHQ-9 and ESS config files

**Files:**
- Create: `webapp/js/instruments/phq9.js`
- Create: `webapp/js/instruments/ess.js`
- Create: `webapp/tests/instruments.test.js`

The instrument files call a global `registerInstrument(def)`. For Node tests we
provide a tiny shim that captures registrations. In the browser, `core.js`
defines the real `registerInstrument` (Task 11) — but it must be loaded *after*
the instrument files, so the instrument files must tolerate it not existing yet.
Solution: each instrument file pushes onto a global queue `__INSTRUMENT_QUEUE__`
if `registerInstrument` isn't defined; `core.js` drains the queue on load.

- [ ] **Step 1: Write the failing test**

`webapp/tests/instruments.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

// Provide a capturing registerInstrument before requiring instrument files.
const captured = {};
global.registerInstrument = (def) => { captured[def.id] = def; };

require("../js/instruments/phq9.js");
require("../js/instruments/ess.js");

function optionValues(def, itemId) {
  const item = def.items.find((i) => i.id === itemId);
  const set = item.options || def.responseSets[item.responseSet];
  return set.map((o) => o.value);
}

test("PHQ-9 has 9 items on a 0-3 frequency scale", () => {
  const d = captured["phq9"];
  assert.equal(d.items.length, 9);
  assert.equal(d.scoring.rule, "sum");
  assert.deepEqual(optionValues(d, "phq9_1"), [0, 1, 2, 3]);
  assert.match(d.items[0].text, /Little interest or pleasure/);
});

test("ESS has 8 items on a 0-3 dozing scale", () => {
  const d = captured["ess"];
  assert.equal(d.items.length, 8);
  assert.equal(d.scoring.rule, "sum");
  assert.deepEqual(optionValues(d, d.items[7].id), [0, 1, 2, 3]);
  assert.match(d.items[0].text, /Sitting and reading/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/instruments.test.js`
Expected: FAIL — cannot find `phq9.js`.

- [ ] **Step 3: Write minimal implementation**

`webapp/js/instruments/phq9.js`:

```js
(function () {
  "use strict";
  const def = {
    id: "phq9",
    name: "Patient Health Questionnaire (PHQ-9)",
    instructions: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    responseSets: {
      freq: [
        { label: "Not at all", value: 0 },
        { label: "Several days", value: 1 },
        { label: "More than half the days", value: 2 },
        { label: "Nearly every day", value: 3 },
      ],
    },
    items: [
      { id: "phq9_1", text: "Little interest or pleasure in doing things", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_2", text: "Feeling down, depressed, or hopeless", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_3", text: "Trouble falling or staying asleep, or sleeping too much", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_4", text: "Feeling tired or having little energy", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_5", text: "Poor appetite or overeating", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_6", text: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_7", text: "Trouble concentrating on things, such as reading the newspaper or watching television", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_8", text: "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_9", text: "Thoughts that you would be better off dead or of hurting yourself in some way", type: "choice", responseSet: "freq", subscale: "total" },
    ],
    scoring: { rule: "sum", subscales: { total: { max: 27 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
```

`webapp/js/instruments/ess.js`:

```js
(function () {
  "use strict";
  const dozing = [
    { label: "Would never doze", value: 0 },
    { label: "Slight chance of dozing", value: 1 },
    { label: "Moderate chance of dozing", value: 2 },
    { label: "High chance of dozing", value: 3 },
  ];
  const situations = [
    "Sitting and reading",
    "Watching TV",
    "Sitting, inactive in a public place (e.g. a theatre or a meeting)",
    "As a passenger in a car for an hour without a break",
    "Lying down to rest in the afternoon when circumstances permit",
    "Sitting and talking to someone",
    "Sitting quietly after a lunch without alcohol",
    "In a car, while stopped for a few minutes in the traffic",
  ];
  const def = {
    id: "ess",
    name: "Epworth Sleepiness Scale (ESS)",
    instructions: "How likely are you to doze off or fall asleep in the following situations, in contrast to feeling just tired? This refers to your usual way of life in recent times. Even if you have not done some of these things recently, try to work out how they would have affected you.",
    responseSets: { dozing },
    items: situations.map((text, i) => ({
      id: "ess_" + (i + 1), text, type: "choice", responseSet: "dozing", subscale: "total",
    })),
    scoring: { rule: "sum", subscales: { total: { max: 24 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/instruments.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/instruments/phq9.js webapp/js/instruments/ess.js webapp/tests/instruments.test.js
git commit -m "feat(instruments): PHQ-9 and ESS configs"
```

---

## Task 9: HADS config file

**Files:**
- Create: `webapp/js/instruments/hads.js`
- Modify: `webapp/tests/instruments.test.js`

14 items, each with item-specific `options` (values literal as printed on the
form). 7 anxiety + 7 depression. Order follows the form (left column items 1–7,
then right column 8–14).

- [ ] **Step 1: Write the failing test** (append to `instruments.test.js`)

```js
require("../js/instruments/hads.js");

test("HADS has 7 anxiety + 7 depression items with literal option values", () => {
  const d = captured["hads"];
  assert.equal(d.items.length, 14);
  assert.equal(d.scoring.rule, "hadsSubscales");
  const anx = d.items.filter((i) => i.subscale === "anxiety");
  const dep = d.items.filter((i) => i.subscale === "depression");
  assert.equal(anx.length, 7);
  assert.equal(dep.length, 7);
  // Item 1 "I feel tense or 'wound up'": 3,2,1,0
  assert.deepEqual(d.items[0].options.map((o) => o.value), [3, 2, 1, 0]);
  assert.match(d.items[0].text, /tense or 'wound up'/);
  // Item 2 "I still enjoy...": 0,1,2,3
  assert.deepEqual(d.items[1].options.map((o) => o.value), [0, 1, 2, 3]);
  // every option value is within 0..3
  for (const it of d.items) for (const o of it.options) assert.ok(o.value >= 0 && o.value <= 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/instruments.test.js`
Expected: FAIL — cannot find `hads.js`.

- [ ] **Step 3: Write minimal implementation**

`webapp/js/instruments/hads.js`:

```js
(function () {
  "use strict";
  const o = (label, value) => ({ label, value });
  const def = {
    id: "hads",
    name: "Hospital Anxiety and Depression Scale (HADS)",
    instructions: "Tick the box beside the reply that is closest to how you have been feeling in the past week. Do not take too long over your replies: your immediate reaction to each item will probably be more accurate than a long, thought-out response.",
    items: [
      // Left column (form order 1–7)
      { id: "hads_1", subscale: "anxiety", type: "choice", text: "I feel tense or 'wound up':",
        options: [o("Most of the time", 3), o("A lot of the time", 2), o("From time to time, occasionally", 1), o("Not at all", 0)] },
      { id: "hads_2", subscale: "depression", type: "choice", text: "I still enjoy the things I used to enjoy:",
        options: [o("Definitely as much", 0), o("Not quite so much", 1), o("Only a little", 2), o("Hardly at all", 3)] },
      { id: "hads_3", subscale: "anxiety", type: "choice", text: "I get a sort of frightened feeling as if something awful is about to happen:",
        options: [o("Very definitely and quite badly", 3), o("Yes, but not too badly", 2), o("A little, but it doesn't worry me", 1), o("Not at all", 0)] },
      { id: "hads_4", subscale: "depression", type: "choice", text: "I can laugh and see the funny side of things:",
        options: [o("As much as I always could", 0), o("Not quite so much now", 1), o("Definitely not so much now", 2), o("Not at all", 3)] },
      { id: "hads_5", subscale: "anxiety", type: "choice", text: "Worrying thoughts go through my mind:",
        options: [o("A great deal of the time", 3), o("A lot of the time", 2), o("From time to time, but not too often", 1), o("Only occasionally", 0)] },
      { id: "hads_6", subscale: "depression", type: "choice", text: "I feel cheerful:",
        options: [o("Not at all", 3), o("Not often", 2), o("Sometimes", 1), o("Most of the time", 0)] },
      { id: "hads_7", subscale: "anxiety", type: "choice", text: "I can sit at ease and feel relaxed:",
        options: [o("Definitely", 0), o("Usually", 1), o("Not often", 2), o("Not at all", 3)] },
      // Right column (form order 8–14)
      { id: "hads_8", subscale: "depression", type: "choice", text: "I feel as if I am slowed down:",
        options: [o("Nearly all the time", 3), o("Very often", 2), o("Sometimes", 1), o("Not at all", 0)] },
      { id: "hads_9", subscale: "anxiety", type: "choice", text: "I get a sort of frightened feeling like 'butterflies' in the stomach:",
        options: [o("Not at all", 0), o("Occasionally", 1), o("Quite often", 2), o("Very often", 3)] },
      { id: "hads_10", subscale: "depression", type: "choice", text: "I have lost interest in my appearance:",
        options: [o("Definitely", 3), o("I don't take as much care as I should", 2), o("I may not take quite as much care", 1), o("I take just as much care as ever", 0)] },
      { id: "hads_11", subscale: "anxiety", type: "choice", text: "I feel restless as I have to be on the move:",
        options: [o("Very much indeed", 3), o("Quite a lot", 2), o("Not very much", 1), o("Not at all", 0)] },
      { id: "hads_12", subscale: "depression", type: "choice", text: "I look forward with enjoyment to things:",
        options: [o("As much as I ever did", 0), o("Rather less than I used to", 1), o("Definitely less than I used to", 2), o("Hardly at all", 3)] },
      { id: "hads_13", subscale: "anxiety", type: "choice", text: "I get sudden feelings of panic:",
        options: [o("Very often indeed", 3), o("Quite often", 2), o("Not very often", 1), o("Not at all", 0)] },
      { id: "hads_14", subscale: "depression", type: "choice", text: "I can enjoy a good book or radio or TV program:",
        options: [o("Often", 0), o("Sometimes", 1), o("Not often", 2), o("Very seldom", 3)] },
    ],
    scoring: { rule: "hadsSubscales", subscales: { anxiety: { max: 21 }, depression: { max: 21 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/instruments.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/instruments/hads.js webapp/tests/instruments.test.js
git commit -m "feat(instruments): HADS config with literal per-item option values"
```

---

## Task 10: Lawton IADL config file

**Files:**
- Create: `webapp/js/instruments/lawton-iadl.js`
- Modify: `webapp/tests/instruments.test.js`

8 categories (A–H), each one `choice` item with per-option 0/1 values from the form.

- [ ] **Step 1: Write the failing test** (append to `instruments.test.js`)

```js
require("../js/instruments/lawton-iadl.js");

test("Lawton has 8 categories with printed 0/1 option values", () => {
  const d = captured["lawton"];
  assert.equal(d.items.length, 8);
  assert.equal(d.scoring.rule, "lawtonSum");
  const vals = (id) => d.items.find((i) => i.id === id).options.map((o) => o.value);
  assert.deepEqual(vals("lawton_A"), [1, 1, 1, 0]);   // Telephone
  assert.deepEqual(vals("lawton_B"), [1, 0, 0, 0]);   // Shopping
  assert.deepEqual(vals("lawton_C"), [1, 0, 0, 0]);   // Food prep
  assert.deepEqual(vals("lawton_D"), [1, 1, 1, 1, 0]); // Housekeeping
  assert.deepEqual(vals("lawton_E"), [1, 1, 0]);       // Laundry
  assert.deepEqual(vals("lawton_F"), [1, 1, 1, 0, 0]); // Transport
  assert.deepEqual(vals("lawton_G"), [1, 0, 0]);       // Medications
  assert.deepEqual(vals("lawton_H"), [1, 1, 0]);       // Finances
  // max possible = 8
  const max = d.items.reduce((t, i) => t + Math.max(...i.options.map((o) => o.value)), 0);
  assert.equal(max, 8);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/instruments.test.js`
Expected: FAIL — cannot find `lawton-iadl.js`.

- [ ] **Step 3: Write minimal implementation**

`webapp/js/instruments/lawton-iadl.js`:

```js
(function () {
  "use strict";
  const o = (label, value) => ({ label, value });
  const def = {
    id: "lawton",
    name: "Lawton-Brody Instrumental Activities of Daily Living Scale (IADL)",
    instructions: "For each category below, choose the description that most closely resembles your own highest level of functioning.",
    items: [
      { id: "lawton_A", type: "choice", text: "A. Ability to use the telephone", options: [
        o("Operates telephone on own initiative — looks up and dials numbers, etc.", 1),
        o("Dials a few well-known numbers", 1),
        o("Answers telephone but does not dial", 1),
        o("Does not use telephone at all", 0)] },
      { id: "lawton_B", type: "choice", text: "B. Shopping", options: [
        o("Takes care of all shopping needs independently", 1),
        o("Shops independently for small purchases", 0),
        o("Needs to be accompanied on any shopping trip", 0),
        o("Completely unable to shop", 0)] },
      { id: "lawton_C", type: "choice", text: "C. Food preparation", options: [
        o("Plans, prepares and serves adequate meals independently", 1),
        o("Prepares adequate meals if supplied with ingredients", 0),
        o("Heats, serves and prepares meals, or prepares meals but does not maintain adequate diet", 0),
        o("Needs to have meals prepared and served", 0)] },
      { id: "lawton_D", type: "choice", text: "D. Housekeeping", options: [
        o("Maintains house alone or with occasional assistance (e.g. heavy-work domestic help)", 1),
        o("Performs light daily tasks such as dish washing, bed making", 1),
        o("Performs light daily tasks but cannot maintain acceptable level of cleanliness", 1),
        o("Needs help with all home maintenance tasks", 1),
        o("Does not participate in any housekeeping tasks", 0)] },
      { id: "lawton_E", type: "choice", text: "E. Laundry", options: [
        o("Does personal laundry completely", 1),
        o("Launders small items — rinses stockings, etc.", 1),
        o("All laundry must be done by others", 0)] },
      { id: "lawton_F", type: "choice", text: "F. Mode of transportation", options: [
        o("Travels independently on public transportation or drives own car", 1),
        o("Arranges own travel via taxi, but does not otherwise use public transportation", 1),
        o("Travels on public transportation when accompanied by another", 1),
        o("Travel limited to taxi or automobile with assistance of another", 0),
        o("Does not travel at all", 0)] },
      { id: "lawton_G", type: "choice", text: "G. Responsibility for own medications", options: [
        o("Is responsible for taking medication in correct dosages at correct time", 1),
        o("Takes responsibility if medication is prepared in advance in separate dosages", 0),
        o("Is not capable of dispensing own medication", 0)] },
      { id: "lawton_H", type: "choice", text: "H. Ability to handle finances", options: [
        o("Manages financial matters independently (budgets, writes cheques, pays rent/bills, goes to bank), collects and keeps track of income", 1),
        o("Manages day-to-day purchases, but needs help with banking, major purchases, etc.", 1),
        o("Incapable of handling money", 0)] },
    ],
    scoring: { rule: "lawtonSum", subscales: { total: { max: 8 } } },
    notes: "Scored across all 8 domains (0–8). Historical male 0–5 exclusion not applied.",
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/instruments.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/instruments/lawton-iadl.js webapp/tests/instruments.test.js
git commit -m "feat(instruments): Lawton-Brody IADL config"
```

---

## Task 11: PSQI config file

**Files:**
- Create: `webapp/js/instruments/psqi.js`
- Modify: `webapp/tests/instruments.test.js`

Mixed `text` (times/minutes/hours) + `choice` (0–3) items; the bed-partner
section is omitted. `scoring.rule = "psqi"`.

- [ ] **Step 1: Write the failing test** (append to `instruments.test.js`)

```js
require("../js/instruments/psqi.js");

test("PSQI config: scored item set, types, and frequency values", () => {
  const d = captured["psqi"];
  assert.equal(d.scoring.rule, "psqi");
  const ids = d.items.map((i) => i.id);
  for (const id of ["q1_bedtime", "q2_latency_min", "q3_risetime", "q4_hours_sleep",
    "q5a", "q5b", "q5c", "q5d", "q5e", "q5f", "q5g", "q5h", "q5i", "q5j",
    "q6_quality", "q7_medication", "q8_stayawake", "q9_enthusiasm"]) {
    assert.ok(ids.includes(id), "missing " + id);
  }
  assert.ok(!ids.includes("q10"), "bed-partner section must be omitted");
  const item = (id) => d.items.find((i) => i.id === id);
  assert.equal(item("q1_bedtime").type, "text");
  assert.equal(item("q1_bedtime").format, "time");
  assert.equal(item("q2_latency_min").format, "number");
  assert.deepEqual(item("q5a").options.map((o) => o.value), [0, 1, 2, 3]);
  assert.deepEqual(item("q6_quality").options.map((o) => o.value), [0, 1, 2, 3]);
  // q5j carries an optional comment field id
  assert.equal(item("q5j").commentId, "q5j_text");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/instruments.test.js`
Expected: FAIL — cannot find `psqi.js`.

- [ ] **Step 3: Write minimal implementation**

`webapp/js/instruments/psqi.js`:

```js
(function () {
  "use strict";
  const o = (label, value) => ({ label, value });
  const freq = [
    o("Not during the past month", 0),
    o("Less than once a week", 1),
    o("Once or twice a week", 2),
    o("Three or more times a week", 3),
  ];
  const disturbance = [
    ["q5a", "Cannot get to sleep within 30 minutes"],
    ["q5b", "Wake up in the middle of the night or early morning"],
    ["q5c", "Have to get up to use the bathroom"],
    ["q5d", "Cannot breathe comfortably"],
    ["q5e", "Cough or snore loudly"],
    ["q5f", "Feel too cold"],
    ["q5g", "Feel too hot"],
    ["q5h", "Had bad dreams"],
    ["q5i", "Have pain"],
  ].map(([id, text]) => ({ id, type: "choice", text, options: freq, group: "q5" }));

  const def = {
    id: "psqi",
    name: "Pittsburgh Sleep Quality Index (PSQI)",
    instructions: "The following questions relate to your usual sleep habits during the past month only. Your answers should indicate the most accurate reply for the majority of days and nights in the past month. Please answer all questions.",
    items: [
      { id: "q1_bedtime", type: "text", format: "time", text: "During the past month, what time have you usually gone to bed at night? (e.g. 23:00 or 11:00 PM)" },
      { id: "q2_latency_min", type: "text", format: "number", text: "During the past month, how long (in minutes) has it usually taken you to fall asleep each night?" },
      { id: "q3_risetime", type: "text", format: "time", text: "During the past month, what time have you usually gotten up in the morning? (e.g. 07:00 or 7:00 AM)" },
      { id: "q4_hours_sleep", type: "text", format: "number", text: "During the past month, how many hours of actual sleep did you get at night? (This may be different than the number of hours you spent in bed.)" },
      { id: "q5_header", type: "static", text: "During the past month, how often have you had trouble sleeping because you…" },
      ...disturbance,
      { id: "q5j", type: "choice", text: "Other reason(s), please describe — then rate how often you had trouble sleeping because of this:", options: freq, group: "q5", commentId: "q5j_text", commentLabel: "Other reason(s)" },
      { id: "q6_quality", type: "choice", text: "During the past month, how would you rate your sleep quality overall?",
        options: [o("Very good", 0), o("Fairly good", 1), o("Fairly bad", 2), o("Very bad", 3)] },
      { id: "q7_medication", type: "choice", text: "During the past month, how often have you taken medicine to help you sleep (prescribed or 'over the counter')?", options: freq },
      { id: "q8_stayawake", type: "choice", text: "During the past month, how often have you had trouble staying awake while driving, eating meals, or engaging in social activity?", options: freq },
      { id: "q9_enthusiasm", type: "choice", text: "During the past month, how much of a problem has it been for you to keep up enough enthusiasm to get things done?",
        options: [o("No problem at all", 0), o("Only a very slight problem", 1), o("Somewhat of a problem", 2), o("A very big problem", 3)] },
    ],
    scoring: { rule: "psqi", subscales: { global: { max: 21 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/instruments.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/instruments/psqi.js webapp/tests/instruments.test.js
git commit -m "feat(instruments): PSQI config (bed-partner section omitted)"
```

---

## Task 12: core.js — pure logic (token store, attempt counter, shuffle, results builder)

**Files:**
- Create: `webapp/js/core.js`
- Create: `webapp/tests/core.test.js`

This task implements only the **pure / unit-testable** parts of `core.js`. DOM
rendering is Task 13. The functions: `makeToken(randFn)`, `nextAttempt(store)`,
`shuffle(array, randFn)`, `scoreInstrument(def, responses)`,
`buildResults(order, defsById, responsesByInstrument, meta)`, `toCSVRow(results)`.

`scoreInstrument` dispatches on `def.scoring.rule` to the `scoring.js` functions
and attaches bands. In the browser, `core.js` reads `scoring.js` globals; under
Node we `require` it.

- [ ] **Step 1: Write the failing test**

`webapp/tests/core.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

test("makeToken produces a stable p_ prefixed id from injected randomness", () => {
  const t = C.makeToken(() => 0.5);
  assert.match(t, /^p_[0-9a-f-]{6,}$/);
});

test("nextAttempt increments a numeric counter starting at 1", () => {
  assert.equal(C.nextAttempt({}), 1);
  assert.equal(C.nextAttempt({ completed: 1 }), 2);
  assert.equal(C.nextAttempt({ completed: 2 }), 3);
});

test("shuffle preserves the multiset and length (deterministic randFn)", () => {
  const arr = ["a", "b", "c", "d", "e"];
  const seq = [0.9, 0.1, 0.5, 0.0];      // injected randomness
  let i = 0;
  const out = C.shuffle(arr.slice(), () => seq[i++ % seq.length]);
  assert.equal(out.length, 5);
  assert.deepEqual(out.slice().sort(), arr.slice().sort());
});

test("scoreInstrument dispatches by rule and attaches bands", () => {
  const phq9 = { id: "phq9", items: [{ id: "a" }, { id: "b" }], scoring: { rule: "sum" } };
  const r = C.scoreInstrument(phq9, { a: 3, b: 2 });
  assert.deepEqual(r.scores, { total: 5 });
  assert.deepEqual(r.bands, { total: "mild" });

  const hads = { id: "hads", items: [{ id: "x", subscale: "anxiety" }, { id: "y", subscale: "depression" }], scoring: { rule: "hadsSubscales" } };
  const rh = C.scoreInstrument(hads, { x: 11, y: 3 });
  assert.deepEqual(rh.scores, { anxiety: 11, depression: 3 });
  assert.deepEqual(rh.bands, { anxiety: "case", depression: "normal" });
});

test("buildResults assembles metadata + per-instrument blocks", () => {
  const defsById = {
    phq9: { id: "phq9", items: [{ id: "a" }], scoring: { rule: "sum" } },
  };
  const responses = { phq9: { a: 4 } };
  const out = C.buildResults(["phq9"], defsById, responses, {
    participantToken: "p_x", attempt: 2, storagePersistent: true, timestamp: "2026-06-01T00:00:00.000Z",
  });
  assert.equal(out.participantToken, "p_x");
  assert.equal(out.attempt, 2);
  assert.deepEqual(out.presentationOrder, ["phq9"]);
  assert.equal(out.instruments.phq9.scores.total, 4);
  assert.equal(out.instruments.phq9.bands.total, "minimal");
});

test("toCSVRow emits a header + value row with leading metadata", () => {
  const results = {
    participantToken: "p_x", attempt: 1, storagePersistent: true,
    timestamp: "2026-06-01T00:00:00.000Z", presentationOrder: ["phq9"],
    instruments: { phq9: { responses: [{ itemId: "a", value: 4 }], scores: { total: 4 }, bands: { total: "minimal" } } },
  };
  const csv = C.toCSVRow(results);
  const [header, row] = csv.trim().split("\n");
  const cols = header.split(",");
  assert.ok(cols.includes("participantToken"));
  assert.ok(cols.includes("attempt"));
  assert.ok(cols.includes("phq9_item_a"));
  assert.ok(cols.includes("phq9_score_total"));
  assert.ok(cols.includes("phq9_band_total"));
  assert.equal(row.split(",")[cols.indexOf("phq9_score_total")], "4");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/core.test.js`
Expected: FAIL — cannot find `core.js`.

- [ ] **Step 3: Write minimal implementation**

`webapp/js/core.js`:

```js
(function (global) {
  "use strict";

  // In the browser scoring.js attaches its API to window; under Node we require it.
  const S = (typeof module !== "undefined" && module.exports)
    ? require("./scoring.js")
    : global;

  // ---------- pure helpers ----------

  function makeToken(randFn) {
    const rnd = randFn || Math.random;
    const hex = (n) => Math.floor(rnd() * 16 ** n).toString(16).padStart(n, "0");
    return "p_" + hex(8) + "-" + hex(4) + "-" + hex(4) + "-" + hex(8);
  }

  function nextAttempt(store) {
    const completed = (store && Number.isFinite(store.completed)) ? store.completed : 0;
    return completed + 1;
  }

  function shuffle(array, randFn) {
    const rnd = randFn || Math.random;
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function scoreInstrument(def, responses) {
    let scores;
    switch (def.scoring.rule) {
      case "sum":
      case "lawtonSum":
        scores = { total: (def.scoring.rule === "sum" ? S.sumScore : S.lawtonSum)(def.items, responses) };
        break;
      case "hadsSubscales":
        scores = S.hadsSubscales(def.items, responses);
        break;
      case "psqi":
        scores = S.psqiScore(responses);
        break;
      default:
        throw new Error("Unknown scoring rule: " + def.scoring.rule);
    }
    return { scores, bands: S.bandFor(def.id, scores) };
  }

  function _responseRows(def, responses) {
    // For export: list each answered item with value (+ label for choice items).
    const rows = [];
    for (const item of def.items) {
      if (item.type === "static") continue;
      const raw = responses[item.id];
      if (item.type === "choice") {
        const opt = (item.options || []).find((o) => o.value === raw);
        rows.push({ itemId: item.id, value: raw, label: opt ? opt.label : null });
      } else {
        rows.push({ itemId: item.id, value: raw });
      }
      if (item.commentId) rows.push({ itemId: item.commentId, value: responses[item.commentId] || "" });
    }
    return rows;
  }

  function buildResults(order, defsById, responsesByInstrument, meta) {
    const instruments = {};
    for (const id of order) {
      const def = defsById[id];
      const responses = responsesByInstrument[id] || {};
      const { scores, bands } = scoreInstrument(def, responses);
      instruments[id] = { responses: _responseRows(def, responses), scores, bands };
    }
    return {
      participantToken: meta.participantToken,
      attempt: meta.attempt,
      storagePersistent: meta.storagePersistent,
      timestamp: meta.timestamp,
      presentationOrder: order.slice(),
      instruments,
    };
  }

  function _csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSVRow(results) {
    const header = ["participantToken", "attempt", "storagePersistent", "timestamp", "presentationOrder"];
    const row = [results.participantToken, results.attempt, results.storagePersistent, results.timestamp,
      results.presentationOrder.join("|")];
    for (const id of Object.keys(results.instruments)) {
      const block = results.instruments[id];
      for (const r of block.responses) { header.push(id + "_item_" + r.itemId); row.push(r.value); }
      for (const k of Object.keys(block.scores)) { header.push(id + "_score_" + k); row.push(block.scores[k]); }
      for (const k of Object.keys(block.bands)) { header.push(id + "_band_" + k); row.push(block.bands[k]); }
    }
    return header.map(_csvEscape).join(",") + "\n" + row.map(_csvEscape).join(",") + "\n";
  }

  const API = { makeToken, nextAttempt, shuffle, scoreInstrument, buildResults, toCSVRow };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/core.test.js`
Expected: PASS (all core tests).

- [ ] **Step 5: Run the whole suite + commit**

Run: `node --test webapp/tests/*.test.js`
Expected: PASS (scoring + instruments + core).

```bash
git add webapp/js/core.js webapp/tests/core.test.js
git commit -m "feat(core): pure logic — token, attempt, shuffle, scoring dispatch, results + CSV builders"
```

---

## Task 13: Vendor the SurveyJS runtime

**Files:**
- Create: `webapp/vendor/survey-core.min.css`
- Create: `webapp/vendor/survey.core.min.js`
- Create: `webapp/vendor/survey-js-ui.min.js`

SurveyJS is vendored locally (no run-time CDN). This task is asset download +
verification (not TDD). Pin one version `V` for `survey-core` and `survey-js-ui`.

- [ ] **Step 1: Resolve and pin the version**

Run:

```bash
V=$(npm view survey-core version) && echo "SurveyJS version: $V"
```

Expected: prints a version like `2.x.y`. Record `$V` for the README (Task 17).

- [ ] **Step 2: Download the three runtime files**

Run:

```bash
mkdir -p webapp/vendor
curl -fsSL "https://unpkg.com/survey-core@${V}/survey-core.min.css" -o webapp/vendor/survey-core.min.css
curl -fsSL "https://unpkg.com/survey-core@${V}/survey.core.min.js"  -o webapp/vendor/survey.core.min.js
curl -fsSL "https://unpkg.com/survey-js-ui@${V}/survey-js-ui.min.js" -o webapp/vendor/survey-js-ui.min.js
```

- [ ] **Step 3: Verify the downloads are real (non-empty, expected globals)**

Run:

```bash
ls -l webapp/vendor/
grep -l "Survey" webapp/vendor/survey.core.min.js
grep -l "Survey" webapp/vendor/survey-js-ui.min.js
```

Expected: all three files present and non-trivial in size (JS ≫ 100 KB, CSS ≫ 10 KB);
`grep` finds the `Survey` token in both JS files. If a file is tiny or is an
HTML error page, re-check `$V` and the URLs.

- [ ] **Step 4: Commit**

```bash
git add webapp/vendor/
git commit -m "chore(webapp): vendor SurveyJS runtime (pinned)"
```

---

## Task 14: `survey-adapter.js` — config → SurveyJS pages

**Files:**
- Create: `webapp/js/survey-adapter.js`
- Create: `webapp/tests/adapter.test.js`

`toSurveyJson(defsById, order, opts)` returns a SurveyJS survey JSON: one page
per instrument (in `order`), each item mapped to a SurveyJS question. Pure
function → Node-testable with synthetic defs (no SurveyJS needed).

Mapping rules:
- `type:"static"` → `{ type:"html", name, html:"<h3>…</h3>" }`
- `type:"choice"` → `{ type:"radiogroup", name, title, isRequired:true,
  choices:[{value,text}…] }`; if `commentId`, also emit a `text` question
  `{ type:"text", name:commentId, title:commentLabel, isRequired:false }`
- `type:"text"`, `format:"time"` → `{ type:"text", name, title, inputType:"time",
  isRequired:true }`
- `type:"text"`, `format:"number"` → `{ type:"text", name, title,
  inputType:"number", isRequired:true, validators:[{type:"numeric",minValue:0}] }`
- Survey-level: `showProgressBar:"top"`, `progressBarType:"pages"`,
  `showQuestionNumbers:"off"`, `completedHtml: opts.completedHtml`.

- [ ] **Step 1: Write the failing test**

`webapp/tests/adapter.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { toSurveyJson } = require("../js/survey-adapter.js");

const defsById = {
  demo: {
    id: "demo", name: "Demo Scale", instructions: "Answer please.",
    responseSets: { freq: [{ label: "No", value: 0 }, { label: "Yes", value: 1 }] },
    items: [
      { id: "c1", type: "choice", text: "A choice", responseSet: "freq" },
      { id: "hdr", type: "static", text: "Section header" },
      { id: "t1", type: "text", format: "time", text: "Bed time?" },
      { id: "n1", type: "text", format: "number", text: "Minutes?" },
      { id: "cj", type: "choice", text: "Other?", options: [{ label: "No", value: 0 }, { label: "Yes", value: 1 }], commentId: "cj_text", commentLabel: "Describe" },
    ],
    scoring: { rule: "sum" },
  },
  demo2: { id: "demo2", name: "Second", instructions: "x", items: [{ id: "z", type: "choice", text: "Q", options: [{ label: "A", value: 0 }] }], scoring: { rule: "sum" } },
};

test("toSurveyJson builds one page per instrument in the given order", () => {
  const json = toSurveyJson(defsById, ["demo2", "demo"], { completedHtml: "<p>done</p>" });
  assert.equal(json.pages.length, 2);
  assert.deepEqual(json.pages.map((p) => p.name), ["demo2", "demo"]);
  assert.equal(json.completedHtml, "<p>done</p>");
  assert.equal(json.showProgressBar, "top");
});

test("toSurveyJson maps item types correctly", () => {
  const page = toSurveyJson(defsById, ["demo"], {}).pages[0];
  const byName = Object.fromEntries(page.elements.map((e) => [e.name, e]));

  assert.equal(byName.c1.type, "radiogroup");
  assert.equal(byName.c1.isRequired, true);
  assert.deepEqual(byName.c1.choices, [{ value: 0, text: "No" }, { value: 1, text: "Yes" }]);

  assert.equal(byName.hdr.type, "html");
  assert.match(byName.hdr.html, /Section header/);

  assert.equal(byName.t1.type, "text");
  assert.equal(byName.t1.inputType, "time");
  assert.equal(byName.t1.isRequired, true);

  assert.equal(byName.n1.inputType, "number");
  assert.deepEqual(byName.n1.validators, [{ type: "numeric", minValue: 0 }]);

  // comment field emitted as its own non-required text question
  assert.equal(byName.cj.type, "radiogroup");
  assert.equal(byName.cj_text.type, "text");
  assert.equal(byName.cj_text.isRequired, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test webapp/tests/adapter.test.js`
Expected: FAIL — cannot find `survey-adapter.js`.

- [ ] **Step 3: Write minimal implementation**

`webapp/js/survey-adapter.js`:

```js
(function (global) {
  "use strict";

  function _choices(item, def) {
    const set = item.options || (def.responseSets && def.responseSets[item.responseSet]) || [];
    return set.map((o) => ({ value: o.value, text: o.label }));
  }

  function _itemToElements(item, def) {
    if (item.type === "static") {
      return [{ type: "html", name: item.id, html: "<h3>" + item.text + "</h3>" }];
    }
    if (item.type === "choice") {
      const els = [{
        type: "radiogroup", name: item.id, title: item.text,
        isRequired: true, choices: _choices(item, def),
      }];
      if (item.commentId) {
        els.push({
          type: "text", name: item.commentId,
          title: item.commentLabel || "Please describe", isRequired: false,
        });
      }
      return els;
    }
    if (item.type === "text") {
      if (item.format === "time") {
        return [{ type: "text", name: item.id, title: item.text, inputType: "time", isRequired: true }];
      }
      if (item.format === "number") {
        return [{
          type: "text", name: item.id, title: item.text, inputType: "number",
          isRequired: true, validators: [{ type: "numeric", minValue: 0 }],
        }];
      }
      return [{ type: "text", name: item.id, title: item.text, isRequired: true }];
    }
    throw new Error("Unknown item type: " + item.type);
  }

  function toSurveyJson(defsById, order, opts) {
    const options = opts || {};
    const pages = order.map((id) => {
      const def = defsById[id];
      const elements = [];
      for (const item of def.items) elements.push(..._itemToElements(item, def));
      return { name: def.id, title: def.name, description: def.instructions, elements };
    });
    return {
      showProgressBar: "top",
      progressBarType: "pages",
      showQuestionNumbers: "off",
      completedHtml: options.completedHtml || "<h2>Thank you.</h2>",
      pages,
    };
  }

  const API = { toSurveyJson };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test webapp/tests/adapter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/js/survey-adapter.js webapp/tests/adapter.test.js
git commit -m "feat(adapter): map instrument configs to SurveyJS pages"
```

---

## Task 15: core.js — SurveyJS controller (registry, storage, flow, download)

**Files:**
- Modify: `webapp/js/core.js`

Append the browser-only controller (no-op under Node, guarded by
`typeof document !== "undefined"`). It defines the real `registerInstrument`,
drains `__INSTRUMENT_QUEUE__`, manages `localStorage`, builds + renders the
SurveyJS model, and on completion splits `survey.data` per instrument, builds
results, and wires downloads. It uses the globals `Survey` (vendored) and
`toSurveyJson` (adapter).

- [ ] **Step 1: Add the controller functions** (inside the IIFE, after `toCSVRow`, before the `API` assignment)

```js
  // ---------- browser-only: state + storage ----------
  const STORE_KEY = "ssrc_assessment_v1";
  const registry = [];
  const defsById = {};

  function registerInstrument(def) { registry.push(def); defsById[def.id] = def; }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return { store: raw ? JSON.parse(raw) : {}, persistent: true };
    } catch (e) { return { store: {}, persistent: false }; }
  }
  function writeStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
    catch (e) { return false; }
  }
  function ensureToken() {
    const { store, persistent } = readStore();
    if (!store.token) { store.token = makeToken(); writeStore(store); }
    return { token: store.token, completed: store.completed || 0, persistent };
  }
  function resetParticipant() {
    const { store } = readStore();
    store.token = makeToken(); store.completed = 0; writeStore(store);
  }
  function recordCompletion() {
    const { store } = readStore();
    store.completed = (store.completed || 0) + 1; writeStore(store);
  }

  // ---------- browser-only: helpers ----------
  function splitData(order, data) {
    // SurveyJS data is flat {questionName: value}; split into per-instrument maps.
    const byInstrument = {};
    for (const id of order) {
      const def = defsById[id];
      const responses = {};
      for (const item of def.items) {
        if (item.type === "static") continue;
        if (data[item.id] !== undefined) responses[item.id] = data[item.id];
        if (item.commentId && data[item.commentId] !== undefined) responses[item.commentId] = data[item.commentId];
      }
      byInstrument[id] = responses;
    }
    return byInstrument;
  }

  function autofillData(order) {
    const data = {};
    for (const id of order) {
      for (const item of defsById[id].items) {
        if (item.type === "static") continue;
        if (item.type === "choice") {
          const opts = item.options || defsById[id].responseSets[item.responseSet];
          data[item.id] = opts[Math.floor(Math.random() * opts.length)].value;
          if (item.commentId) data[item.commentId] = "auto";
        } else if (item.format === "time") {
          data[item.id] = item.id === "q3_risetime" ? "07:00" : "23:00";
        } else if (item.format === "number") {
          data[item.id] = item.id === "q4_hours_sleep" ? 7 : 20;
        }
      }
    }
    return data;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }
```

Then add the bootstrap function:

```js
  function startApp() {
    const q = global.__INSTRUMENT_QUEUE__ || [];
    q.forEach(registerInstrument); q.length = 0;

    const landing = document.getElementById("screen-landing");
    const container = document.getElementById("surveyContainer");

    const info = ensureToken();
    const attempt = nextAttempt({ completed: info.completed });
    document.getElementById("attempt-note").textContent =
      "This will be attempt " + attempt +
      (info.persistent ? "" : " — note: persistent storage is unavailable, so test-retest pairing may not work.");

    document.getElementById("reset-link").addEventListener("click", (e) => {
      e.preventDefault(); resetParticipant(); location.reload();
    });

    // Latest results held for the completion-page download buttons (event delegation).
    let latest = null;
    document.addEventListener("click", (e) => {
      if (!latest) return;
      if (e.target && e.target.id === "dl-json")
        download(latest.base + ".json", JSON.stringify(latest.results, null, 2), "application/json");
      if (e.target && e.target.id === "dl-csv")
        download(latest.base + ".csv", toCSVRow(latest.results), "text/csv");
    });

    const debug = new URLSearchParams(location.search).get("debug") === "1";

    document.getElementById("begin-btn").addEventListener("click", () => {
      const order = shuffle(registry.map((d) => d.id));
      const completedHtml =
        '<div class="done"><h2>Thank you</h2>' +
        "<p>Your responses are complete. Please download your results file(s) and return them as instructed.</p>" +
        '<button id="dl-json" class="primary" type="button">Download results (JSON)</button> ' +
        '<button id="dl-csv" class="primary" type="button">Download results (CSV)</button></div>';

      const survey = new Survey.Model(toSurveyJson(defsById, order, { completedHtml }));
      if (debug) survey.data = autofillData(order);

      survey.onComplete.add((sender) => {
        const responsesByInstrument = splitData(order, sender.data);
        const meta = {
          participantToken: info.token, attempt,
          storagePersistent: info.persistent, timestamp: new Date().toISOString(),
        };
        const results = buildResults(order, defsById, responsesByInstrument, meta);
        recordCompletion();
        latest = { results, base: "assessment-" + info.token + "-attempt" + attempt + "-" + meta.timestamp.replace(/[:.]/g, "-") };
      });

      landing.hidden = true;
      container.hidden = false;
      survey.render(container);
    });
  }
```

- [ ] **Step 2: Wire the bootstrap** (after the `API` assignment line, before the closing `})(...)`, add)

```js
  if (typeof document !== "undefined") {
    global.registerInstrument = registerInstrument;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startApp);
    else startApp();
  }
```

- [ ] **Step 3: Re-run the Node suite to confirm no regressions**

Run: `node --test webapp/tests/*.test.js`
Expected: PASS — the controller is guarded by `typeof document !== "undefined"`,
so Node still only exercises the pure API (`makeToken`, `nextAttempt`, `shuffle`,
`scoreInstrument`, `buildResults`, `toCSVRow`).

- [ ] **Step 4: Commit**

```bash
git add webapp/js/core.js
git commit -m "feat(core): SurveyJS controller — registry, storage, flow, completion downloads"
```

---

## Task 16: index.html + styles.css

**Files:**
- Create: `webapp/index.html`
- Create: `webapp/css/styles.css`

- [ ] **Step 1: Create `webapp/index.html`** (script order: vendor → scoring → instruments → adapter → core)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Self-Report Assessments</title>
  <link rel="stylesheet" href="vendor/survey-core.min.css" />
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <main class="container">
    <section id="screen-landing">
      <h1>Self-Report Assessments</h1>
      <p>This set of five short questionnaires takes about 10–15 minutes. They appear in a random order. Please answer every item based on how you have generally been feeling.</p>
      <p id="attempt-note" class="muted"></p>
      <button id="begin-btn" class="primary" type="button">Begin</button>
      <p class="muted small"><a href="#" id="reset-link">Not you? Start as a new participant</a></p>
    </section>

    <div id="surveyContainer" hidden></div>
  </main>

  <script src="vendor/survey.core.min.js"></script>
  <script src="vendor/survey-js-ui.min.js"></script>
  <script src="js/scoring.js"></script>
  <script src="js/instruments/phq9.js"></script>
  <script src="js/instruments/ess.js"></script>
  <script src="js/instruments/hads.js"></script>
  <script src="js/instruments/lawton-iadl.js"></script>
  <script src="js/instruments/psqi.js"></script>
  <script src="js/survey-adapter.js"></script>
  <script src="js/core.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `webapp/css/styles.css`** (light overrides; SurveyJS supplies the form theme)

```css
:root { --fg: #1a1a1a; --muted: #666; --accent: #2a5db0; }
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--fg); line-height: 1.5; margin: 0; background: #fafafa; }
.container { max-width: 760px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
h1 { font-size: 1.6rem; }
.muted { color: var(--muted); } .small { font-size: 0.9rem; }
button.primary { font: inherit; font-weight: 600; background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 0.6rem 1.2rem; cursor: pointer; margin: 0.25rem 0.5rem 0.25rem 0; }
button.primary:hover { filter: brightness(1.07); }
.done { padding: 1rem 0; }
[hidden] { display: none !important; }
```

- [ ] **Step 3: Commit**

```bash
git add webapp/index.html webapp/css/styles.css
git commit -m "feat(webapp): index.html shell (SurveyJS) + style overrides"
```

---

## Task 17: End-to-end verification (Playwright via webapp-testing) + README

**Files:**
- Create: `webapp/README.md`

- [ ] **Step 1: Serve the app**

Run a static server from the repo root:
`python3 -m http.server 8000 --directory webapp`

- [ ] **Step 2: Smoke-test with debug autofill (Playwright / webapp-testing)**

Open `http://localhost:8000/?debug=1`. Verify:
1. Landing shows "This will be attempt 1".
2. Click **Begin** → SurveyJS renders the first questionnaire with a top progress
   bar; because `?debug=1` pre-filled `survey.data`, the questions are answered.
3. Click the SurveyJS **Next** button repeatedly (the last page's button reads
   **Complete**) → advance through all 5 pages.
4. The **Thank you** completion page appears with two buttons.
5. Click **Download results (JSON)** and **(CSV)** → two files download.
6. Open the JSON: `participantToken` starts `p_`, `attempt` is 1,
   `presentationOrder` has all 5 ids in some order, `instruments.psqi.scores`
   has `c1`…`c7` + `global`, and no scores are shown on screen.

- [ ] **Step 3: Validation-guard check (no debug)**

Open `http://localhost:8000/`. Click **Begin**, then **Next** without answering →
SurveyJS shows required-field errors and does not advance. Answer all items →
**Next** advances.

- [ ] **Step 4: Test-retest pairing check**

Reload the landing page → "This will be attempt 2" (counter persisted via
`localStorage`). Click **"Not you? Start as a new participant"** → reloads showing
"attempt 1" with a fresh token.

- [ ] **Step 5: Create `webapp/README.md`** (replace `<VERSION>` with `$V` from Task 13)

```markdown
# Self-Report Assessment Web-App

Five self-report questionnaires (PSQI, HADS, Lawton IADL, ESS, PHQ-9) presented
in random order, scored locally, exported as JSON + CSV. Rendering by SurveyJS
(free MIT runtime, vendored in `vendor/`, version `<VERSION>`). No backend.

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

## Editing item content

Each scale is one file in `js/instruments/`. Edit the `text`/`options` there; the
adapter (`js/survey-adapter.js`) turns it into a SurveyJS page. Reload — no build.

## Updating SurveyJS

Re-download the three files in `vendor/` for a new pinned version (see the
vendoring step in the implementation plan) and update the version above.

## Tests

    node --test webapp/tests/*.test.js
```

- [ ] **Step 6: Commit**

```bash
git add webapp/README.md
git commit -m "docs(webapp): README with hosting + test-retest + SurveyJS vendoring notes"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** SurveyJS rendering/validation/mobile/progress (T14–T16),
  vendored offline (T13), randomised page order via our shuffle (T15),
  one-scale-per-page (adapter T14 — one page per instrument), five instruments
  with verbatim content (T8–T11), all scoring rules incl. the official PSQI
  manual + Q5j rule + 7-h duration boundary (T6), severity bands recorded not
  shown (T7; T15 `completedHtml` shows no scores), JSON+CSV export with
  token/attempt (T12 builders, T15 wiring), persistent pseudonymous token +
  attempt counter + reset + storage-unavailable flag (T15), demographics omitted
  / PSQI partner section omitted (T11), `?debug=1` (T15), Node unit tests for all
  pure logic incl. the adapter (T1–T12, T14), Playwright E2E + README same-device
  note (T17). ✔
- **Placeholder scan:** none — every code step is complete. SurveyJS version is
  resolved at vendoring time (T13) and recorded in the README (T17).
- **Type consistency:** `registerInstrument`/`__INSTRUMENT_QUEUE__` consistent
  across T8–T15; `toSurveyJson(defsById, order, opts)` defined in T14 and called
  in T15; `buildResults`/`toCSVRow` signatures match between T12 definitions and
  the T15 controller; SurveyJS `survey.data` keys = item ids = scoring fn keys.
- **Stack-change check:** Tasks 1–12 are framework-agnostic and unaffected by
  the SurveyJS decision; only the render/HTML/E2E layer changed (old T13–T15 →
  new T13–T17).
