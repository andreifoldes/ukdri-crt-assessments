const test = require("node:test");
const assert = require("node:assert/strict");
const St = require("../js/stats.js");

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test("stats module exposes expected functions", () => {
  for (const name of ["parseRows", "retestPairs", "convergentPairs", "icc21", "blandAltman", "zscore", "invFcdf", "fcdf"]) {
    assert.equal(typeof St[name], "function", `${name} should be a function`);
  }
});

test("parseRows coerces score columns and drops rows without token/attempt", () => {
  const rows = St.parseRows([
    { participantToken: "BAKOR", attempt: "1", phq9_score_total: "12", psqi_score_global: "6" },
    { participantToken: "", attempt: "1", phq9_score_total: "3" },   // no token -> dropped
    { participantToken: "ZONUK", phq9_score_total: "5" },             // no attempt -> dropped
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token, "BAKOR");
  assert.equal(rows[0].attempt, 1);
  assert.equal(rows[0].phq9, 12);
  assert.equal(rows[0].psqi, 6);
  assert.equal(rows[0].ess, null);   // missing column -> null, not 0
});

test("retestPairs pairs the two lowest distinct attempts; excludes single-attempt tokens", () => {
  const rows = [
    { token: "AAA", attempt: 1, phq9: 10 },
    { token: "AAA", attempt: 2, phq9: 12 },
    { token: "BBB", attempt: 1, phq9: 5 },     // single attempt -> excluded
    { token: "CCC", attempt: 3, phq9: 7 },
    { token: "CCC", attempt: 1, phq9: 6 },
    { token: "CCC", attempt: 2, phq9: 9 },     // lowest two are attempts 1 & 2
    { token: "DDD", attempt: 1, phq9: null },  // null value -> not counted
    { token: "DDD", attempt: 2, phq9: 4 },
  ];
  const pairs = St.retestPairs(rows, "phq9").sort((a, b) => a.token.localeCompare(b.token));
  assert.deepEqual(pairs.map((p) => p.token), ["AAA", "CCC"]);
  assert.deepEqual(St.retestPairs(rows, "phq9").find((p) => p.token === "CCC"), { token: "CCC", a1: 6, a2: 9 });
});

test("convergentPairs takes one record per token at its lowest attempt where both scales present", () => {
  const rows = [
    { token: "AAA", attempt: 2, hads_dep: 9, phq9: 11 },
    { token: "AAA", attempt: 1, hads_dep: 8, phq9: 10 },  // lower attempt wins
    { token: "BBB", attempt: 1, hads_dep: 5, phq9: null }, // phq9 missing -> excluded
  ];
  const { xs, ys, tokens } = St.convergentPairs(rows, "hads_dep", "phq9");
  assert.deepEqual(tokens, ["AAA"]);
  assert.deepEqual(xs, [8]);
  assert.deepEqual(ys, [10]);
});

test("icc21 matches a hand-computed ANOVA example", () => {
  // pairs (1,2),(2,3),(3,5),(4,6): MSR=4.8333, MSC=4.5, MSE=0.16667 -> ICC(2,1)=0.6512
  const pairs = [
    { a1: 1, a2: 2 }, { a1: 2, a2: 3 }, { a1: 3, a2: 5 }, { a1: 4, a2: 6 },
  ];
  const r = St.icc21(pairs);
  assert.equal(r.n, 4);
  near(r.icc, 0.6512, 0.001, "icc point estimate");
  near(r.msr, 4.83333, 0.001, "MSR");
  near(r.mse, 0.16667, 0.001, "MSE");
  // CI brackets the estimate
  assert.ok(r.lo < r.icc && r.icc < r.hi, `CI should bracket estimate: [${r.lo}, ${r.hi}]`);
});

test("icc21 returns ~1 for perfect agreement and null below n=2", () => {
  const perfect = St.icc21([{ a1: 1, a2: 1 }, { a1: 2, a2: 2 }, { a1: 5, a2: 5 }]);
  near(perfect.icc, 1, 1e-9, "perfect agreement");
  assert.equal(St.icc21([{ a1: 1, a2: 2 }]).icc, null);
});

test("iccBand uses Cicchetti (1994) thresholds", () => {
  assert.equal(St.iccBand(0.3), "poor");      // < 0.40
  assert.equal(St.iccBand(0.5), "fair");      // 0.40–0.59
  assert.equal(St.iccBand(0.65), "good");     // 0.60–0.74
  assert.equal(St.iccBand(0.8), "excellent"); // ≥ 0.75
  assert.equal(St.iccBand(null), "n/a");
});

test("invFcdf reproduces known F quantiles", () => {
  near(St.invFcdf(0.95, 1, 1), 161.45, 0.5, "F_0.95(1,1)");
  near(St.invFcdf(0.975, 1, 1), 647.79, 3.0, "F_0.975(1,1)");
  near(St.invFcdf(0.95, 5, 10), 3.3258, 0.01, "F_0.95(5,10)");
  near(St.invFcdf(0.99, 10, 20), 3.3682, 0.01, "F_0.99(10,20)");
});

test("fcdf is the inverse of invFcdf", () => {
  for (const [d1, d2] of [[3, 7], [5, 10], [2.5, 8.3]]) {
    const q = St.invFcdf(0.9, d1, d2);
    near(St.fcdf(q, d1, d2), 0.9, 1e-4, `fcdf(invFcdf) d=(${d1},${d2})`);
  }
});

test("blandAltman computes bias, sd and limits of agreement", () => {
  const ba = St.blandAltman([10, 12, 14], [8, 12, 10]); // diff = [2,0,4]
  assert.deepEqual(ba.mean, [9, 12, 12]);
  assert.deepEqual(ba.diff, [2, 0, 4]);
  near(ba.bias, 2, 1e-9, "bias");
  near(ba.sd, 2, 1e-9, "sd (sample)");
  near(ba.loLoA, 2 - 1.96 * 2, 1e-9, "lower LoA");
  near(ba.hiLoA, 2 + 1.96 * 2, 1e-9, "upper LoA");
});

test("zscore standardises to mean 0 / sd 1 and handles constants", () => {
  const z = St.zscore([1, 2, 3, 4, 5]);
  near(z.reduce((a, b) => a + b, 0), 0, 1e-9, "mean 0");
  assert.deepEqual(St.zscore([7, 7, 7]), [0, 0, 0]);
});
