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
