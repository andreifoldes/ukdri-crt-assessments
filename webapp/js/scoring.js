(function (global) {
  "use strict";

  function sumScore(items, responses) {
    return items.reduce((total, item) => {
      const v = responses[item.id];
      return total + (Number.isFinite(v) ? v : 0);
    }, 0);
  }
  function hadsSubscales(items, responses) { return { anxiety: 0, depression: 0 }; }
  function lawtonSum(items, responses) { return 0; }
  function psqiScore(responses) { return { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, global: 0 }; }
  function bandFor(instrumentId, scores) { return {}; }
  function parseTimeToMinutes(str) { return null; }
  function hoursInBed(bedStr, riseStr) { return null; }

  const API = { sumScore, hadsSubscales, lawtonSum, psqiScore, bandFor, parseTimeToMinutes, hoursInBed };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
