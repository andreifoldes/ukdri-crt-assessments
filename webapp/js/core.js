(function (global) {
  "use strict";

  // In the browser scoring.js attaches its API to window; under Node we require it.
  const S = (typeof module !== "undefined" && module.exports)
    ? require("./scoring.js")
    : global;

  // ---------- pure helpers ----------

  function makeToken(randFn) {
    const rnd = randFn || Math.random;
    const hex = (n) => Math.floor(rnd() * 16 ** n).toString(16).padStart(n, "0");
    return "p_" + hex(8) + "-" + hex(4) + "-" + hex(4) + "-" + hex(8);
  }

  function nextAttempt(store) {
    const completed = (store && Number.isFinite(store.completed)) ? store.completed : 0;
    return completed + 1;
  }

  function shuffle(array, randFn) {
    const rnd = randFn || Math.random;
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function scoreInstrument(def, responses) {
    let scores;
    switch (def.scoring.rule) {
      case "sum":
      case "lawtonSum":
        scores = { total: (def.scoring.rule === "sum" ? S.sumScore : S.lawtonSum)(def.items, responses) };
        break;
      case "hadsSubscales":
        scores = S.hadsSubscales(def.items, responses);
        break;
      case "psqi":
        scores = S.psqiScore(responses);
        break;
      default:
        throw new Error("Unknown scoring rule: " + def.scoring.rule);
    }
    return { scores, bands: S.bandFor(def.id, scores) };
  }

  function _responseRows(def, responses) {
    // For export: list each answered item with value (+ label for choice items).
    const rows = [];
    for (const item of def.items) {
      if (item.type === "static") continue;
      const raw = responses[item.id];
      if (item.type === "choice") {
        const opt = (item.options || []).find((o) => o.value === raw);
        rows.push({ itemId: item.id, value: raw, label: opt ? opt.label : null });
      } else {
        rows.push({ itemId: item.id, value: raw });
      }
      if (item.commentId) rows.push({ itemId: item.commentId, value: responses[item.commentId] || "" });
    }
    return rows;
  }

  function buildResults(order, defsById, responsesByInstrument, meta) {
    const instruments = {};
    for (const id of order) {
      const def = defsById[id];
      const responses = responsesByInstrument[id] || {};
      const { scores, bands } = scoreInstrument(def, responses);
      instruments[id] = { responses: _responseRows(def, responses), scores, bands };
    }
    return {
      participantToken: meta.participantToken,
      attempt: meta.attempt,
      storagePersistent: meta.storagePersistent,
      timestamp: meta.timestamp,
      presentationOrder: order.slice(),
      instruments,
    };
  }

  function _csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSVRow(results) {
    const header = ["participantToken", "attempt", "storagePersistent", "timestamp", "presentationOrder"];
    const row = [results.participantToken, results.attempt, results.storagePersistent, results.timestamp,
      results.presentationOrder.join("|")];
    for (const id of Object.keys(results.instruments)) {
      const block = results.instruments[id];
      for (const r of block.responses) { header.push(id + "_item_" + r.itemId); row.push(r.value); }
      for (const k of Object.keys(block.scores)) { header.push(id + "_score_" + k); row.push(block.scores[k]); }
      for (const k of Object.keys(block.bands)) { header.push(id + "_band_" + k); row.push(block.bands[k]); }
    }
    return header.map(_csvEscape).join(",") + "\n" + row.map(_csvEscape).join(",") + "\n";
  }

  const API = { makeToken, nextAttempt, shuffle, scoreInstrument, buildResults, toCSVRow };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
