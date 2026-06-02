const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

test("makeToken produces a pronounceable 5-letter CVCVC code", () => {
  const t = C.makeToken(() => 0.5);
  assert.match(t, /^[BCDFGHJKLMNPRSTVWXZ][AEIOU][BCDFGHJKLMNPRSTVWXZ][AEIOU][BCDFGHJKLMNPRSTVWXZ]$/);
});

test("makeToken with randFn returning near-1.0 stays in range (no overflow)", () => {
  const t = C.makeToken(() => 0.999999);
  assert.match(t, /^[BCDFGHJKLMNPRSTVWXZ][AEIOU][BCDFGHJKLMNPRSTVWXZ][AEIOU][BCDFGHJKLMNPRSTVWXZ]$/);
  assert.equal(t.length, 5);
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

test("shuffle does not mutate the caller's input array", () => {
  const arr = ["a", "b", "c", "d", "e"];
  const original = arr.slice();
  C.shuffle(arr, () => 0.5);
  assert.deepEqual(arr, original);
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

test("scoreInstrument throws on an unrecognised rule", () => {
  const bogus = { id: "bogus", items: [], scoring: { rule: "bogus" } };
  assert.throws(() => C.scoreInstrument(bogus, {}), /Unknown scoring rule/);
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

test("buildResults throws when order contains an id missing from defsById", () => {
  const defsById = {
    phq9: { id: "phq9", items: [{ id: "a" }], scoring: { rule: "sum" } },
  };
  assert.throws(
    () => C.buildResults(["phq9", "missing_instrument"], defsById, {}, {
      participantToken: "p_x", attempt: 1, storagePersistent: false, timestamp: "2026-06-01T00:00:00.000Z",
    }),
    /no definition found/
  );
});

test("buildResults throws when meta lacks participantToken", () => {
  const defsById = {
    phq9: { id: "phq9", items: [{ id: "a" }], scoring: { rule: "sum" } },
  };
  assert.throws(
    () => C.buildResults(["phq9"], defsById, {}, { attempt: 1, storagePersistent: false, timestamp: "2026-06-01T00:00:00.000Z" }),
    /participantToken is required/
  );
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

test("buildResults: duplicate-score options export the score + the CORRECT label (C1 regression)", () => {
  // An instrument whose options share a score but have unique values (like Lawton).
  const defsById = {
    lawtonish: {
      id: "lawtonish",
      items: [{ id: "cat", type: "choice", options: [
        { label: "first", value: 0, score: 1 },
        { label: "second", value: 1, score: 1 },
        { label: "none", value: 2, score: 0 },
      ] }],
      scoring: { rule: "lawtonSum" },
    },
  };
  // participant selected the SECOND option (value 1)
  const out = C.buildResults(["lawtonish"], defsById, { lawtonish: { cat: 1 } }, {
    participantToken: "p_x", attempt: 1, storagePersistent: true, timestamp: "2026-06-01T00:00:00.000Z",
  });
  const row = out.instruments.lawtonish.responses[0];
  assert.equal(row.value, 1, "exports the 0/1 score, not the selection index");
  assert.equal(row.label, "second", "label must be the chosen option, not the first value-match");
  assert.equal(out.instruments.lawtonish.scores.total, 1);
});

test("normalizeToken is case-insensitive and letters-only, 5-letter canonical", () => {
  assert.equal(C.normalizeToken("hufir"), "HUFIR");
  assert.equal(C.normalizeToken("  HuFiR "), "HUFIR");
  assert.equal(C.normalizeToken("hu-fi r"), "HUFIR");   // strips non-letters then checks length
  assert.equal(C.normalizeToken("BAKOR"), "BAKOR");
  assert.equal(C.normalizeToken("abcd"), null);          // too short
  assert.equal(C.normalizeToken("abcdef"), null);        // too long
  assert.equal(C.normalizeToken("12345"), null);         // no letters
  assert.equal(C.normalizeToken(""), null);
  assert.equal(C.normalizeToken(null), null);
});
