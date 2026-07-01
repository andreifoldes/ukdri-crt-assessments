// Reproducible synthetic dataset for the downstream test-retest dashboard.
//
// Drives the web-app's REAL scoring (scoring.js) and flattening (submit.js)
// logic so every column matches the live Google-Sheet / CSV export exactly:
// leading meta, per-instrument <id>_position, then item/score/band columns.
//
// 4 participants x 2 attempts = 8 sessions. Attempt 2 is a lightly perturbed
// copy of attempt 1 (~75% of item responses unchanged) so the scales show
// realistic-but-imperfect test-retest agreement. Deterministic (seeded PRNG),
// so re-running reproduces byte-identical output.
//
// Usage:  node analysis/generate_synthetic.js [--n <count>] [--seed <int>] [--out <prefix>]
//   default (no args): 4 fixed-token participants, seed 20260602, prefix
//   "synthetic_sessions" — reproduces the committed baseline byte-for-byte.
//   With --n: generate <count> participants with seeded random CVCVC tokens.
// Writes: analysis/sample-data/<prefix>.csv  (flat, one row/session)
//         analysis/sample-data/<prefix>.json (array of full results)

const fs = require("fs");
const path = require("path");

require("../webapp/js/scoring.js");
const Sub = require("../webapp/js/submit.js");
const Core = require("../webapp/js/core.js");
["phq9", "ess", "hads", "lawton-iadl", "psqi"].forEach((f) =>
  require("../webapp/js/instruments/" + f + ".js"));

const defs = (globalThis.__INSTRUMENT_QUEUE__ || []).slice();
const defsById = {};
defs.forEach((d) => { defsById[d.id] = d; });
const INSTRUMENT_IDS = defs.map((d) => d.id); // phq9, ess, hads, lawton, psqi

// ---- deterministic PRNG (mulberry32) ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// CLI args.
function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--n") a.n = parseInt(argv[++i], 10);
    else if (argv[i] === "--seed") a.seed = parseInt(argv[++i], 10);
    else if (argv[i] === "--out") a.out = argv[++i];
  }
  return a;
}
const ARG = parseArgs(process.argv);
const SEED = ARG.seed != null ? ARG.seed : 20260602;
const OUT = ARG.out || "synthetic_sessions";

const rng = mulberry32(SEED);
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

function seededShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pad2(n) { return String(n).padStart(2, "0"); }

// ---- generate one instrument's raw responses ----
function genResponses(def) {
  const resp = {};
  for (const item of def.items) {
    if (item.type === "static") continue;
    if (item.type === "choice") {
      // Options are inline (HADS/Lawton/PSQI) or shared via responseSet (PHQ-9/ESS).
      const opts = item.options || (def.responseSets && def.responseSets[item.responseSet]);
      resp[item.id] = pick(opts).value;
      // q5j and similar comment fields: leave blank (scores 0 by design).
    } else if (item.type === "text" && item.format === "number") {
      if (/latency/.test(item.id)) resp[item.id] = randInt(2, 45);          // minutes to fall asleep
      else if (/hours_sleep/.test(item.id)) resp[item.id] = randInt(4, 9);  // hours slept
      else resp[item.id] = randInt(0, 10);
    } else if (item.type === "text" && item.format === "time") {
      if (/bedtime/.test(item.id)) resp[item.id] = pad2(pick([21, 22, 22, 23, 23, 0, 1])) + ":" + pad2(pick([0, 15, 30, 45]));
      else resp[item.id] = pad2(randInt(6, 9)) + ":" + pad2(pick([0, 15, 30, 45]));
    }
  }
  return resp;
}

// ---- perturb attempt 1 -> attempt 2 (keep ~75% identical) ----
function perturb(def, base) {
  const next = {};
  for (const item of def.items) {
    if (item.type === "static") continue;
    if (!(item.id in base)) continue;
    if (rng() < 0.75) { next[item.id] = base[item.id]; continue; } // unchanged
    // re-roll this single item
    const one = genResponses(def);
    next[item.id] = one[item.id];
  }
  return next;
}

// Pronounceable CVCVC token, same alphabet as the app's makeToken.
function genToken() {
  const C = "BCDFGHJKLMNPRSTVWXZ", V = "AEIOU";
  const p = (s) => s[Math.floor(rng() * s.length)];
  return p(C) + p(V) + p(C) + p(V) + p(C);
}

let PARTICIPANTS;
if (ARG.n != null) {
  PARTICIPANTS = [];
  const seen = new Set();
  while (PARTICIPANTS.length < ARG.n) { const t = genToken(); if (!seen.has(t)) { seen.add(t); PARTICIPANTS.push(t); } }
} else {
  PARTICIPANTS = ["BAKOR", "DOMIR", "FELUS", "GINOT"]; // committed baseline
}

function buildSession(token, attempt, responsesByInstrument, isoTime) {
  const order = seededShuffle(INSTRUMENT_IDS);
  const meta = { participantToken: token, attempt, storagePersistent: true, timestamp: isoTime };
  return Core.buildResults(order, defsById, responsesByInstrument, meta);
}

const sessions = [];
PARTICIPANTS.forEach((token, p) => {
  // attempt 1
  const r1 = {};
  INSTRUMENT_IDS.forEach((id) => { r1[id] = genResponses(defsById[id]); });
  sessions.push(buildSession(token, 1, r1, `2026-06-02T09:${pad2(5 + p)}:00.000Z`));
  // attempt 2 (perturbed)
  const r2 = {};
  INSTRUMENT_IDS.forEach((id) => { r2[id] = perturb(defsById[id], r1[id]); });
  sessions.push(buildSession(token, 2, r2, `2026-06-02T09:${pad2(25 + p)}:00.000Z`));
});

// ---- flatten + write ----
const rows = sessions.map((s) => Sub.flattenResults(s));

// Stable union header (preserve first-seen order across rows).
const header = [];
rows.forEach((row) => Object.keys(row).forEach((k) => { if (header.indexOf(k) === -1) header.push(k); }));

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csv = [header.map(csvEscape).join(",")]
  .concat(rows.map((row) => header.map((k) => csvEscape(row.hasOwnProperty(k) ? row[k] : "")).join(",")))
  .join("\n") + "\n";

const outDir = path.join(__dirname, "sample-data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, OUT + ".csv"), csv);
fs.writeFileSync(path.join(outDir, OUT + ".json"), JSON.stringify(sessions, null, 2) + "\n");

console.log(`Wrote ${rows.length} sessions (${PARTICIPANTS.length} participants x 2 attempts), ${header.length} columns. seed=${SEED}`);
console.log(`  analysis/sample-data/${OUT}.csv`);
console.log(`  analysis/sample-data/${OUT}.json`);
