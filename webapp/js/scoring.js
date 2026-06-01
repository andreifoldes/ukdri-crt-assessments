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
  function psqiScore(responses) { return { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, global: 0 }; }
  function bandFor(instrumentId, scores) { return {}; }
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
