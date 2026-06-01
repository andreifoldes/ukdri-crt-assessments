const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/scoring.js");

test("scoring module exposes expected functions", () => {
  for (const name of ["sumScore", "hadsSubscales", "lawtonSum", "psqiScore", "bandFor", "parseTimeToMinutes", "hoursInBed"]) {
    assert.equal(typeof S[name], "function", `${name} should be a function`);
  }
});

test("sumScore adds the chosen numeric values across items", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const responses = { a: 3, b: 0, c: 2 };
  assert.equal(S.sumScore(items, responses), 5);
});

test("sumScore treats a missing response as 0", () => {
  const items = [{ id: "a" }, { id: "b" }];
  assert.equal(S.sumScore(items, { a: 2 }), 2);
});

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

test("lawtonSum sums the 0/1 option values across 8 categories", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: "L" + i }));
  const responses = { L0: 1, L1: 1, L2: 0, L3: 1, L4: 1, L5: 1, L6: 0, L7: 1 };
  assert.equal(S.lawtonSum(items, responses), 6);
});

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

test("sumScore with null responses returns 0 and does not throw", () => {
  const items = [{ id: "a" }, { id: "b" }];
  assert.doesNotThrow(() => S.sumScore(items, null));
  assert.equal(S.sumScore(items, null), 0);
});

test("hadsSubscales with one item's response missing does not inflate the subscale", () => {
  const items = [
    { id: "h1", subscale: "anxiety" },
    { id: "h2", subscale: "depression" },
  ];
  // h2 response is missing — depression should be 0, not inflated
  assert.deepEqual(S.hadsSubscales(items, { h1: 3 }), { anxiety: 3, depression: 0 });
});

test("bandFor('phq9', undefined) does not throw and returns { total: null }", () => {
  assert.doesNotThrow(() => S.bandFor("phq9", undefined));
  assert.deepEqual(S.bandFor("phq9", undefined), { total: null });
});

test("bandFor('hads', {}) returns { anxiety: null, depression: null }", () => {
  assert.doesNotThrow(() => S.bandFor("hads", {}));
  assert.deepEqual(S.bandFor("hads", {}), { anxiety: null, depression: null });
});
