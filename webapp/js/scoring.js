(function (global) {
  "use strict";

  function sumScore(items, responses) {
    return items.reduce((total, item) => {
      const v = responses[item.id];
      return total + (Number.isFinite(v) ? v : 0);
    }, 0);
  }
  function hadsSubscales(items, responses) {
    const out = { anxiety: 0, depression: 0 };
    for (const item of items) {
      const v = responses[item.id];
      if (Number.isFinite(v) && (item.subscale === "anxiety" || item.subscale === "depression")) {
        out[item.subscale] += v;
      }
    }
    return out;
  }
  function lawtonSum(items, responses) {
    return sumScore(items, responses);
  }
  function _num(v) { return Number.isFinite(v) ? v : (Number.isFinite(+v) ? +v : null); }

  function _bandFromSum(sum, b1, b2, b3) {
    // 0 -> 0; [1..b1] -> 1; [b1+1..b2] -> 2; [b2+1..b3] -> 3
    if (sum <= 0) return 0;
    if (sum <= b1) return 1;
    if (sum <= b2) return 2;
    return 3;
  }

  function psqiScore(responses) {
    const r = responses || {};

    // C1 — subjective sleep quality
    const c1 = _num(r.q6_quality) || 0;

    // C2 — sleep latency
    const q2 = _num(r.q2_latency_min);
    let q2new;
    if (q2 === null) q2new = 0;
    else if (q2 <= 15) q2new = 0;
    else if (q2 <= 30) q2new = 1;
    else if (q2 <= 60) q2new = 2;
    else q2new = 3;
    const c2 = _bandFromSum(q2new + (_num(r.q5a) || 0), 2, 4, 6);

    // C3 — sleep duration (note: 7h scores 1, not 0)
    const q4 = _num(r.q4_hours_sleep);
    let c3;
    if (q4 === null) c3 = 0;
    else if (q4 > 7) c3 = 0;
    else if (q4 > 6) c3 = 1;
    else if (q4 > 5) c3 = 2;
    else c3 = 3;

    // C4 — habitual sleep efficiency
    const tib = hoursInBed(r.q1_bedtime, r.q3_risetime);
    let c4 = 0;
    if (tib && tib > 0 && q4 !== null) {
      let eff = (q4 / tib) * 100;
      if (eff > 100) eff = 100;                 // clamp
      if (eff >= 85) c4 = 0;
      else if (eff >= 75) c4 = 1;
      else if (eff >= 65) c4 = 2;
      else c4 = 3;
    }

    // C5 — sleep disturbances (q5b..q5j; q5j = 0 if value OR comment missing)
    const distbKeys = ["q5b", "q5c", "q5d", "q5e", "q5f", "q5g", "q5h", "q5i"];
    let distbSum = distbKeys.reduce((t, k) => t + (_num(r[k]) || 0), 0);
    const q5j = _num(r.q5j);
    const q5jText = typeof r.q5j_text === "string" ? r.q5j_text.trim() : "";
    if (q5j !== null && q5jText !== "") distbSum += q5j;   // else Q5j contributes 0
    const c5 = _bandFromSum(distbSum, 9, 18, 27);

    // C6 — use of sleeping medication
    const c6 = _num(r.q7_medication) || 0;

    // C7 — daytime dysfunction
    const c7 = _bandFromSum((_num(r.q8_stayawake) || 0) + (_num(r.q9_enthusiasm) || 0), 2, 4, 6);

    const global = c1 + c2 + c3 + c4 + c5 + c6 + c7;
    return { c1, c2, c3, c4, c5, c6, c7, global };
  }
  function _phq9Band(t) {
    if (t <= 4) return "minimal";
    if (t <= 9) return "mild";
    if (t <= 14) return "moderate";
    if (t <= 19) return "moderately severe";
    return "severe";
  }
  function _essBand(t) {
    if (t <= 10) return "normal";
    if (t <= 12) return "borderline";
    return "abnormal";
  }
  function _hadsBand(t) {
    if (t <= 7) return "normal";
    if (t <= 10) return "borderline";
    return "case";
  }

  function bandFor(instrumentId, scores) {
    switch (instrumentId) {
      case "phq9": return { total: _phq9Band(scores.total) };
      case "ess":  return { total: _essBand(scores.total) };
      case "hads": return { anxiety: _hadsBand(scores.anxiety), depression: _hadsBand(scores.depression) };
      case "psqi": return { global: scores.global > 5 ? "poor sleep" : "good sleep" };
      case "lawton": return { total: null };  // no standard band
      default: return {};
    }
  }
  function parseTimeToMinutes(str) {
    if (typeof str !== "string") return null;
    const s = str.trim().toLowerCase();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3];
    if (min > 59) return null;
    if (ampm) {
      if (h < 1 || h > 12) return null;
      if (ampm === "am") h = h === 12 ? 0 : h;
      else h = h === 12 ? 12 : h + 12;
    } else if (h > 23) return null;
    return h * 60 + min;
  }

  function hoursInBed(bedStr, riseStr) {
    const bed = parseTimeToMinutes(bedStr);
    const rise = parseTimeToMinutes(riseStr);
    if (bed === null || rise === null) return null;
    let diff = rise - bed;                 // minutes
    if (diff <= 0) diff += 24 * 60;        // overnight wrap; equal times → 24h
    return diff / 60;                      // hours
  }

  const API = { sumScore, hadsSubscales, lawtonSum, psqiScore, bandFor, parseTimeToMinutes, hoursInBed };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
