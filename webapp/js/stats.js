(function (global) {
  "use strict";

  // Pure, dependency-free statistics for the live reliability dashboard.
  // Mirrors the module pattern of scoring.js/submit.js: exports under Node,
  // attaches to window in the browser. Everything here is unit-tested
  // (tests/stats.test.js) so the dashboard's numbers are trustworthy.

  // ---------- scale catalogue ----------
  // Maps each reported scale to its flattened sheet column (see submit.js
  // flattenResults: "<instrumentId>_score_<key>"). Instrument ids come from
  // SCALE_META in core.js: phq9, ess, hads, lawton, psqi.
  const SCALES = [
    { key: "phq9",     col: "phq9_score_total",       label: "PHQ-9",           max: 27, hint: "depression" },
    { key: "ess",      col: "ess_score_total",        label: "ESS",             max: 24, hint: "sleepiness" },
    { key: "hads_anx", col: "hads_score_anxiety",     label: "HADS-Anxiety",    max: 21, hint: "anxiety" },
    { key: "hads_dep", col: "hads_score_depression",  label: "HADS-Depression", max: 21, hint: "depression" },
    { key: "lawton",   col: "lawton_score_total",     label: "Lawton IADL",     max: 8,  hint: "function" },
    { key: "psqi",     col: "psqi_score_global",      label: "PSQI",            max: 21, hint: "sleep quality" },
  ];

  // Cross-instrument convergent pairs (same construct, different instrument).
  const CONVERGENT = [
    { id: "dep", label: "HADS-Depression vs PHQ-9", x: "hads_dep", y: "phq9" },
    { id: "sleep", label: "PSQI vs ESS", x: "psqi", y: "ess" },
  ];

  // ---------- small numeric helpers ----------
  function num(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function mean(a) {
    if (!a.length) return null;
    let s = 0;
    for (const v of a) s += v;
    return s / a.length;
  }
  function sampleVar(a) {
    const n = a.length;
    if (n < 2) return 0;
    const m = mean(a);
    let s = 0;
    for (const v of a) s += (v - m) * (v - m);
    return s / (n - 1);
  }
  function sd(a) { return Math.sqrt(sampleVar(a)); }

  // ---------- row parsing ----------
  // Coerce raw sheet rows (objects keyed by header) into typed records with a
  // token, attempt, and one numeric field per scale key. Drops rows lacking a
  // token or attempt.
  function parseRows(raw) {
    return (raw || [])
      .map((r) => {
        const rec = { token: String(r.participantToken || "").trim(), attempt: num(r.attempt) };
        for (const s of SCALES) rec[s.key] = num(r[s.col]);
        return rec;
      })
      .filter((r) => r.token && r.attempt !== null);
  }

  // ---------- pairing ----------
  // Test-retest pairs for one scale: per token, the two lowest distinct attempts
  // with a finite value for that scale. Tokens with only one attempt are excluded.
  function retestPairs(rows, scaleKey) {
    const byToken = new Map();
    for (const r of rows) {
      const v = r[scaleKey];
      if (v === null || v === undefined) continue;
      if (!byToken.has(r.token)) byToken.set(r.token, []);
      byToken.get(r.token).push({ attempt: r.attempt, v });
    }
    const pairs = [];
    for (const [token, arr] of byToken) {
      arr.sort((a, b) => a.attempt - b.attempt);
      const seen = new Set();
      const uniq = [];
      for (const x of arr) {
        if (!seen.has(x.attempt)) { seen.add(x.attempt); uniq.push(x); }
      }
      if (uniq.length >= 2) pairs.push({ token, a1: uniq[0].v, a2: uniq[1].v });
    }
    return pairs;
  }

  // Cross-instrument: one record per token (its lowest attempt) where both scales
  // are present. Returns aligned x/y vectors plus the tokens.
  function convergentPairs(rows, keyX, keyY) {
    const byToken = new Map();
    for (const r of rows) {
      if (r[keyX] === null || r[keyY] === null) continue;
      const cur = byToken.get(r.token);
      if (!cur || r.attempt < cur.attempt) byToken.set(r.token, r);
    }
    const xs = [], ys = [], tokens = [];
    for (const [token, r] of byToken) { xs.push(r[keyX]); ys.push(r[keyY]); tokens.push(token); }
    return { xs, ys, tokens };
  }

  // ---------- correlation (lifted so core.js could share; kept self-contained) ----------
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2 || ys.length !== n) return null;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i];
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const cov = n * sxy - sx * sy;
    const dx = Math.sqrt(n * sxx - sx * sx);
    const dy = Math.sqrt(n * syy - sy * sy);
    if (dx === 0 || dy === 0) return null;
    return cov / (dx * dy);
  }

  // ---------- ICC(2,1): two-way random, single rater, absolute agreement ----------
  // k = 2 ratings (attempt 1, attempt 2) per subject. Formula and 95% CI follow
  // McGraw & Wong (1996) case A,1 — the same computation as R's irr::icc(
  // "twoway", "agreement", "single"). Returns the point estimate, n, CI bounds,
  // and the underlying mean squares.
  function icc21(pairs) {
    const n = pairs.length;
    const out = { icc: null, n, lo: null, hi: null, msr: null, msc: null, mse: null };
    if (n < 2) return out;
    const k = 2;
    const x1 = pairs.map((p) => p.a1);
    const x2 = pairs.map((p) => p.a2);
    const grand = mean(x1.concat(x2));

    let ssr = 0; // between-subjects (rows)
    for (let i = 0; i < n; i++) {
      const rm = (x1[i] + x2[i]) / 2;
      ssr += (rm - grand) * (rm - grand);
    }
    ssr *= k;

    const c1 = mean(x1), c2 = mean(x2);
    const ssc = n * ((c1 - grand) * (c1 - grand) + (c2 - grand) * (c2 - grand)); // between-measurements (cols)

    let sst = 0;
    for (let i = 0; i < n; i++) {
      sst += (x1[i] - grand) * (x1[i] - grand) + (x2[i] - grand) * (x2[i] - grand);
    }
    const sse = sst - ssr - ssc;

    const MSR = ssr / (n - 1);
    const MSC = ssc / (k - 1);
    const MSE = sse / ((n - 1) * (k - 1));
    out.msr = MSR; out.msc = MSC; out.mse = MSE;

    const denom = MSR + (k - 1) * MSE + (k / n) * (MSC - MSE);
    const icc = denom === 0 ? null : (MSR - MSE) / denom;
    out.icc = icc;

    // 95% CI — only meaningful with residual variance and an in-range estimate.
    if (MSE > 0 && icc !== null && icc > -1 && icc < 1) {
      const alpha = 0.05;
      const a = (k * icc) / (n * (1 - icc));
      const b = 1 + (k * icc * (n - 1)) / (n * (1 - icc));
      const v = Math.pow(a * MSC + b * MSE, 2) /
        (Math.pow(a * MSC, 2) / (k - 1) + Math.pow(b * MSE, 2) / ((n - 1) * (k - 1)));
      const FL = invFcdf(1 - alpha / 2, n - 1, v);
      const FU = invFcdf(1 - alpha / 2, v, n - 1);
      out.lo = (n * (MSR - FL * MSE)) / (FL * (k * MSC + (k * n - k - n) * MSE) + n * MSR);
      out.hi = (n * (FU * MSR - MSE)) / (k * MSC + (k * n - k - n) * MSE + n * FU * MSR);
    }
    return out;
  }

  // Qualitative band for an ICC point estimate (Cicchetti, 1994).
  function iccBand(icc) {
    if (icc === null || icc === undefined || !Number.isFinite(icc)) return "n/a";
    if (icc < 0.40) return "poor";
    if (icc < 0.60) return "fair";
    if (icc < 0.75) return "good";
    return "excellent";
  }

  // ---------- Bland-Altman ----------
  function blandAltman(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    const meanV = [], diff = [];
    for (let i = 0; i < n; i++) {
      meanV.push((xs[i] + ys[i]) / 2);
      diff.push(xs[i] - ys[i]);
    }
    const bias = n ? mean(diff) : null;
    const s = sd(diff);
    return {
      n,
      mean: meanV,
      diff,
      bias,
      sd: s,
      loLoA: bias === null ? null : bias - 1.96 * s,
      hiLoA: bias === null ? null : bias + 1.96 * s,
    };
  }

  function zscore(arr) {
    const m = mean(arr), s = sd(arr);
    if (!s) return arr.map(() => 0);
    return arr.map((v) => (v - m) / s);
  }

  // ---------- F distribution (for the ICC confidence interval) ----------
  // Lanczos log-gamma.
  function logGamma(x) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Continued fraction for the incomplete beta (Numerical Recipes betacf).
  function betacf(a, b, x) {
    const FPMIN = 1e-300, EPS = 3e-12, MAXIT = 300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  // Regularized incomplete beta I_x(a,b).
  function ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
    return 1 - (front * betacf(b, a, 1 - x)) / b;
  }

  // CDF of the F distribution with (d1, d2) degrees of freedom (df may be fractional).
  function fcdf(F, d1, d2) {
    if (F <= 0) return 0;
    return ibeta((d1 * F) / (d1 * F + d2), d1 / 2, d2 / 2);
  }

  // Inverse F CDF (quantile) via bisection; fcdf is monotone increasing in F.
  function invFcdf(p, d1, d2) {
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;
    let lo = 0, hi = 1e8;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (fcdf(mid, d1, d2) < p) lo = mid; else hi = mid;
      if (hi - lo < 1e-9 * Math.max(1, mid)) break;
    }
    return (lo + hi) / 2;
  }

  const API = {
    SCALES, CONVERGENT,
    parseRows, retestPairs, convergentPairs,
    pearson, icc21, iccBand, blandAltman, zscore,
    fcdf, invFcdf, ibeta,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, { Stats: API });
})(typeof window !== "undefined" ? window : globalThis);
