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
