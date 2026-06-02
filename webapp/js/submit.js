(function (global) {
  "use strict";

  // Flatten a results object into a single name-addressed row:
  // { columnName: value }. Same column convention as the CSV export
  // (toCSVRow is refactored to build on this). The column SET does not
  // depend on presentationOrder, so the sheet stays stable across the
  // randomised instrument order.
  function flattenResults(results) {
    const row = {
      participantToken: results.participantToken,
      attempt: results.attempt,
      storagePersistent: results.storagePersistent,
      timestamp: results.timestamp,
      presentationOrder: results.presentationOrder.join("|"),
    };
    for (const id of results.presentationOrder) {
      const block = results.instruments[id];
      if (!block) continue;
      for (const r of block.responses) row[id + "_item_" + r.itemId] = r.value;
      for (const k of Object.keys(block.scores)) row[id + "_score_" + k] = block.scores[k];
      for (const k of Object.keys(block.bands)) row[id + "_band_" + k] = block.bands[k];
    }
    return row;
  }

  // Wrap the row with the shared spam-guard id the Apps Script checks.
  function buildSubmitPayload(results, formId) {
    return { formId: formId, row: flattenResults(results) };
  }

  // Submit only if the endpoint was actually injected at deploy time.
  function shouldSubmit(endpoint) {
    return typeof endpoint === "string" && endpoint.length > 0 &&
      endpoint.indexOf("__SHEET_ENDPOINT__") === -1;
  }

  // POST the payload as text/plain (a "simple request" — no CORS preflight,
  // which Apps Script rejects). Resolves {ok:boolean}; never rejects, so the
  // caller's fallback logic stays simple. fetchImpl is injectable for tests.
  function postToSheet(endpoint, payload, opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs || 4000;
    const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchImpl) return Promise.resolve({ ok: false });
    const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    return fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then((res) => {
        if (!res || !res.ok) return { ok: false };
        return res.json().then((b) => ({ ok: !!(b && b.ok) }), () => ({ ok: false }));
      })
      .catch(() => ({ ok: false }))
      .then((result) => { if (timer) clearTimeout(timer); return result; });
  }

  const API = { flattenResults, buildSubmitPayload, shouldSubmit, postToSheet };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
