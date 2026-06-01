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
