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
