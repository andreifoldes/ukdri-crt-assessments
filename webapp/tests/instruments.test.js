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

require("../js/instruments/lawton-iadl.js");

test("Lawton has 8 categories with unique option values and explicit 0/1 scores", () => {
  const d = captured["lawton"];
  assert.equal(d.items.length, 8);
  assert.equal(d.scoring.rule, "lawtonSum");
  const opts = (id) => d.items.find((i) => i.id === id).options;
  const vals = (id) => opts(id).map((o) => o.value);
  const scores = (id) => opts(id).map((o) => o.score);

  // Each category's option `value`s are the unique sequence 0..n-1
  const seqTo = (n) => Array.from({ length: n }, (_, i) => i);
  assert.deepEqual(vals("lawton_A"), seqTo(4));
  assert.deepEqual(vals("lawton_B"), seqTo(4));
  assert.deepEqual(vals("lawton_C"), seqTo(4));
  assert.deepEqual(vals("lawton_D"), seqTo(5));
  assert.deepEqual(vals("lawton_E"), seqTo(3));
  assert.deepEqual(vals("lawton_F"), seqTo(5));
  assert.deepEqual(vals("lawton_G"), seqTo(3));
  assert.deepEqual(vals("lawton_H"), seqTo(3));

  // Within each category the `value`s are unique (no duplicates)
  for (const item of d.items) {
    const vs = item.options.map((o) => o.value);
    assert.equal(new Set(vs).size, vs.length, `${item.id} has duplicate values`);
  }

  // The `score` arrays match the source-PDF sequences exactly
  assert.deepEqual(scores("lawton_A"), [1, 1, 1, 0]);   // Telephone
  assert.deepEqual(scores("lawton_B"), [1, 0, 0, 0]);   // Shopping
  assert.deepEqual(scores("lawton_C"), [1, 0, 0, 0]);   // Food prep
  assert.deepEqual(scores("lawton_D"), [1, 1, 1, 1, 0]); // Housekeeping
  assert.deepEqual(scores("lawton_E"), [1, 1, 0]);       // Laundry
  assert.deepEqual(scores("lawton_F"), [1, 1, 1, 0, 0]); // Transport
  assert.deepEqual(scores("lawton_G"), [1, 0, 0]);       // Medications
  assert.deepEqual(scores("lawton_H"), [1, 1, 0]);       // Finances

  // max possible total score across the 8 categories = 8
  const max = d.items.reduce((t, i) => t + Math.max(...i.options.map((o) => o.score)), 0);
  assert.equal(max, 8);
});

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

test("instrument files fall back to __INSTRUMENT_QUEUE__ when registerInstrument is absent", () => {
  const saved = global.registerInstrument;
  delete global.registerInstrument;
  globalThis.__INSTRUMENT_QUEUE__ = [];
  delete require.cache[require.resolve("../js/instruments/ess.js")];
  require("../js/instruments/ess.js");
  assert.equal(globalThis.__INSTRUMENT_QUEUE__.length, 1);
  assert.equal(globalThis.__INSTRUMENT_QUEUE__[0].id, "ess");
  global.registerInstrument = saved;
});
