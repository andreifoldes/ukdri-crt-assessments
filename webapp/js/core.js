(function (global) {
  "use strict";

  // In the browser scoring.js attaches its API to window; under Node we require it.
  const S = (typeof module !== "undefined" && module.exports)
    ? require("./scoring.js")
    : global;

  // ---------- pure helpers ----------

  // Non-identifying participant ID used only to pair a participant's two attempts.
  // An easy-to-read pronounceable 5-letter code (consonant-vowel-consonant-vowel-
  // consonant), e.g. "BAKOR", so participants can eyeball-match it across visits.
  // ~171k combinations — fine for a workshop; extend the pattern if the cohort is
  // large. randFn is injectable for tests; the `% length` guards randFn()===1.
  function makeToken(randFn) {
    const rnd = randFn || Math.random;
    const C = "BCDFGHJKLMNPRSTVWXZ"; // consonants (excludes Q, Y)
    const V = "AEIOU";
    const pick = (s) => s[Math.floor(rnd() * s.length) % s.length];
    return pick(C) + pick(V) + pick(C) + pick(V) + pick(C);
  }

  // Normalise a user-entered ID: case-insensitive (upper-cased), letters only.
  // Returns the canonical 5-letter code, or null if it isn't exactly 5 letters.
  function normalizeToken(raw) {
    if (typeof raw !== "string") return null;
    const t = raw.toUpperCase().replace(/[^A-Z]/g, "");
    return t.length === 5 ? t : null;
  }

  function nextAttempt(store) {
    const completed = (store && Number.isFinite(store.completed)) ? store.completed : 0;
    return completed + 1;
  }

  function shuffle(array, randFn) {
    const a = array.slice();
    const rnd = randFn || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Precondition: def.scoring.rule is one of "sum" | "lawtonSum" | "hadsSubscales" | "psqi".
  // Throws for any other rule; the caller must validate def first.
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
        // Options that carry a separate `score` (Lawton) export the score, not the
        // selection-identity value; the label is resolved from the unique value.
        const recordedValue = (opt && opt.score !== undefined) ? opt.score : raw;
        rows.push({ itemId: item.id, value: recordedValue, label: opt ? opt.label : null });
      } else {
        rows.push({ itemId: item.id, value: raw });
      }
      if (item.commentId) rows.push({ itemId: item.commentId, value: responses[item.commentId] || "" });
    }
    return rows;
  }

  function buildResults(order, defsById, responsesByInstrument, meta) {
    if (!meta || !meta.participantToken) throw new Error("buildResults: meta.participantToken is required");
    const instruments = {};
    for (const id of order) {
      const def = defsById[id];
      if (!def) throw new Error(`buildResults: no definition found for instrument "${id}"`);
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
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSVRow(results) {
    const header = ["participantToken", "attempt", "storagePersistent", "timestamp", "presentationOrder"];
    const row = [results.participantToken, results.attempt, results.storagePersistent, results.timestamp,
      results.presentationOrder.join("|")];
    for (const id of results.presentationOrder) {
      const block = results.instruments[id];
      if (!block) continue;
      for (const r of block.responses) { header.push(id + "_item_" + r.itemId); row.push(r.value); } // CSV stores numeric values only; human-readable labels live in the JSON export
      for (const k of Object.keys(block.scores)) { header.push(id + "_score_" + k); row.push(block.scores[k]); }
      for (const k of Object.keys(block.bands)) { header.push(id + "_band_" + k); row.push(block.bands[k]); }
    }
    return header.map(_csvEscape).join(",") + "\n" + row.map(_csvEscape).join(",") + "\n";
  }

  // ---------- test-retest comparison (per-person, illustrative) ----------

  // One number per scale for the cross-visit comparison. HADS combines its two
  // subscales (anxiety + depression) into a single total-distress figure.
  const SCALE_META = [
    { key: "phq9", label: "PHQ-9", get: (s) => s.total },
    { key: "ess", label: "ESS", get: (s) => s.total },
    { key: "hads", label: "HADS (A+D)", get: (s) => (Number(s.anxiety) || 0) + (Number(s.depression) || 0) },
    { key: "lawton", label: "Lawton IADL", get: (s) => s.total },
    { key: "psqi", label: "PSQI", get: (s) => s.global },
  ];

  function scaleVector(results) {
    const out = {};
    const inst = (results && results.instruments) || {};
    for (const m of SCALE_META) {
      const block = inst[m.key];
      if (block && block.scores) {
        const v = m.get(block.scores);
        if (Number.isFinite(v)) out[m.key] = v;
      }
    }
    return out;
  }

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
    if (dx === 0 || dy === 0) return null;   // a constant series has no correlation
    return cov / (dx * dy);
  }

  function _ranks(arr) {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;   // 1-based average rank for ties
      for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
      i = j + 1;
    }
    return ranks;
  }

  function spearman(xs, ys) {
    if (xs.length < 2 || ys.length !== xs.length) return null;
    return pearson(_ranks(xs), _ranks(ys));
  }

  // Compare a participant's previous vs current scale vectors. Illustrative only
  // (within-person, n = number of scales) — NOT a cohort reliability coefficient.
  function compareAttempts(prev, curr) {
    const rows = [], xs = [], ys = [];
    for (const m of SCALE_META) {
      const a = prev ? prev[m.key] : undefined;
      const b = curr ? curr[m.key] : undefined;
      if (Number.isFinite(a) && Number.isFinite(b)) {
        rows.push({ scale: m.key, label: m.label, v1: a, v2: b, delta: b - a });
        xs.push(a); ys.push(b);
      }
    }
    return { rows, n: rows.length, pearson: pearson(xs, ys), spearman: spearman(xs, ys) };
  }

  // ---------- browser-only: state + storage ----------
  const STORE_KEY = "ssrc_assessment_v1";
  const registry = [];
  const defsById = {};

  function registerInstrument(def) { registry.push(def); defsById[def.id] = def; }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return { store: raw ? JSON.parse(raw) : {}, persistent: true };
    } catch (e) { return { store: {}, persistent: false }; }
  }
  function writeStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
    catch (e) { return false; }
  }
  function ensureToken() {
    const { store, persistent } = readStore();
    if (!store.token) { store.token = makeToken(); writeStore(store); }
    return { token: store.token, completed: store.completed || 0, persistent };
  }
  function resetParticipant() {
    const { store } = readStore();
    store.token = makeToken(); store.completed = 0; store.history = []; writeStore(store);
  }
  function recordCompletion() {
    const { store } = readStore();
    store.completed = (store.completed || 0) + 1; writeStore(store);
  }
  // Returning participant restoring the ID from their first visit (e.g. a new
  // device/browser where the token didn't persist). Adopt the entered ID and
  // mark this as at least a second attempt so the export labels it as a retest.
  function setParticipantId(token) {
    const { store } = readStore();
    store.token = token;
    store.completed = Math.max(store.completed || 0, 1);
    store.history = [];   // this device has no local attempt history for the restored ID
    writeStore(store);
  }
  // Per-attempt scale vectors, kept locally to drive the cross-visit comparison.
  function priorAttemptScores() {
    const { store } = readStore();
    const h = store.history || [];
    return h.length ? h[h.length - 1] : null;
  }
  function recordAttemptScores(attempt, scores) {
    const { store } = readStore();
    store.history = (store.history || []).concat([{ attempt: attempt, scores: scores }]);
    writeStore(store);
  }

  // ---------- browser-only: helpers ----------
  function splitData(order, data) {
    // SurveyJS data is flat {questionName: value}; split into per-instrument maps.
    const byInstrument = {};
    for (const id of order) {
      const def = defsById[id];
      const responses = {};
      for (const item of def.items) {
        if (item.type === "static") continue;
        if (data[item.id] !== undefined) responses[item.id] = data[item.id];
        if (item.commentId && data[item.commentId] !== undefined) responses[item.commentId] = data[item.commentId];
      }
      byInstrument[id] = responses;
    }
    return byInstrument;
  }

  function autofillData(order) {
    const data = {};
    for (const id of order) {
      for (const item of defsById[id].items) {
        if (item.type === "static") continue;
        if (item.type === "choice") {
          const opts = item.options || defsById[id].responseSets[item.responseSet];
          data[item.id] = opts[Math.floor(Math.random() * opts.length)].value;
          if (item.commentId) data[item.commentId] = "auto";
        } else if (item.format === "time") {
          data[item.id] = item.id === "q3_risetime" ? "07:00" : "23:00";
        } else if (item.format === "number") {
          data[item.id] = item.id === "q4_hours_sleep" ? 7 : 20;
        }
      }
    }
    return data;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // Build the per-person cross-visit comparison HTML for the completion screen.
  function renderRetestHtml(cmp, prevAttempt, currAttempt) {
    const fmtDelta = (d) => (d > 0 ? "+" + d : String(d));
    const rows = cmp.rows.map((r) =>
      "<tr><td>" + r.label + "</td><td>" + r.v1 + "</td><td>" + r.v2 +
      '</td><td class="delta">' + fmtDelta(r.delta) + "</td></tr>"
    ).join("");
    const corr = (cmp.pearson === null)
      ? "<p class=\"muted small\">Not enough overlapping scales to compute a consistency figure.</p>"
      : "<p>Within-person consistency across the " + cmp.n +
        " scale scores (illustrative only — not a formal reliability coefficient): " +
        "Pearson r = " + cmp.pearson.toFixed(2) +
        (cmp.spearman === null ? "" : "; Spearman ρ = " + cmp.spearman.toFixed(2)) + ".</p>";
    return '<div class="retest"><h3>How your scores compare with your previous attempt</h3>' +
      "<table><thead><tr><th>Scale</th><th>Attempt " + prevAttempt + "</th><th>Attempt " + currAttempt +
      "</th><th>Change</th></tr></thead><tbody>" + rows + "</tbody></table>" + corr +
      '<p class="muted small">Higher is worse for PHQ-9, ESS, HADS and PSQI; higher is better for Lawton IADL. ' +
      "A formal test–retest reliability statistic is computed across all participants from the collected data, not from one person.</p></div>";
  }

  // Copy helper with a fallback for non-secure contexts (e.g. http on a LAN IP,
  // where navigator.clipboard is unavailable). Returns a Promise.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", "");
        ta.style.position = "absolute"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("copy command failed"));
      } catch (e) { reject(e); }
    });
  }

  function startApp() {
    const q = global.__INSTRUMENT_QUEUE__ || [];
    q.forEach(registerInstrument); q.length = 0;

    const landing = document.getElementById("screen-landing");
    const container = document.getElementById("surveyContainer");

    const info = ensureToken();
    const attempt = nextAttempt({ completed: info.completed });
    document.getElementById("participant-id").textContent = "Your ID: " + info.token;
    document.getElementById("attempt-note").textContent =
      "This will be attempt " + attempt +
      (info.persistent ? "" : " — note: persistent storage is unavailable, so test-retest pairing may not work.");

    document.getElementById("reset-link").addEventListener("click", (e) => {
      e.preventDefault(); resetParticipant(); location.reload();
    });

    // Returning participant can restore the ID from their first visit (case-insensitive).
    const idInput = document.getElementById("id-input");
    const idFeedback = document.getElementById("id-feedback");
    function applyEnteredId() {
      const token = normalizeToken(idInput.value);
      if (!token) {
        idFeedback.textContent = "Please enter your 5-letter ID (letters only).";
        return;
      }
      setParticipantId(token);
      location.reload();
    }
    document.getElementById("set-id-btn").addEventListener("click", applyEnteredId);
    idInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyEnteredId(); } });

    // Copy ID to clipboard (landing button + completion-screen button via delegation below).
    function copyIdWithFeedback(feedbackEl) {
      copyText(info.token)
        .then(() => { if (feedbackEl) feedbackEl.textContent = "Copied!"; })
        .catch(() => { if (feedbackEl) feedbackEl.textContent = "Select the ID and copy it manually."; });
    }
    document.getElementById("copy-id-btn").addEventListener("click", () =>
      copyIdWithFeedback(document.getElementById("copy-feedback")));

    // Latest results held for the completion-page download buttons (event delegation).
    let latest = null;
    document.addEventListener("click", (e) => {
      if (e.target && e.target.id === "copy-id-done") {
        copyIdWithFeedback(document.getElementById("copy-feedback-done"));
        return;
      }
      if (!latest) return;
      if (e.target && e.target.id === "dl-json")
        download(latest.base + ".json", JSON.stringify(latest.results, null, 2), "application/json");
      if (e.target && e.target.id === "dl-csv")
        download(latest.base + ".csv", toCSVRow(latest.results), "text/csv");
    });

    const debug = new URLSearchParams(location.search).get("debug") === "1";

    document.getElementById("begin-btn").addEventListener("click", () => {
      let finished = false;   // guard: completion runs once per survey instance
      const order = shuffle(registry.map((d) => d.id));
      const completedHtml =
        '<div class="done"><h2>Thank you</h2>' +
        '<p class="participant-id">Your ID: ' + info.token + '</p>' +
        '<p><button id="copy-id-done" class="secondary" type="button">Copy to clipboard</button> ' +
        '<span id="copy-feedback-done" class="id-feedback"></span></p>' +
        "<p>Your responses are complete. Please download your results file(s) and return them as instructed.</p>" +
        '<button id="dl-json" class="primary" type="button">Download results (JSON)</button> ' +
        '<button id="dl-csv" class="primary" type="button">Download results (CSV)</button>' +
        '<div id="retest-summary"></div></div>';

      const survey = new Survey.Model(toSurveyJson(defsById, order, { completedHtml }));
      if (debug) survey.data = autofillData(order);

      survey.onComplete.add((sender) => {
        if (finished) return;
        finished = true;
        const responsesByInstrument = splitData(order, sender.data);
        const meta = {
          participantToken: info.token, attempt,
          storagePersistent: info.persistent, timestamp: new Date().toISOString(),
        };
        const results = buildResults(order, defsById, responsesByInstrument, meta);
        latest = { results, base: "assessment-" + info.token + "-attempt" + attempt + "-" + meta.timestamp.replace(/[:.]/g, "-") };

        // Cross-visit comparison: read the previous attempt BEFORE recording this one.
        const prior = priorAttemptScores();
        const currVector = scaleVector(results);
        recordCompletion();
        recordAttemptScores(attempt, currVector);
        if (prior && prior.scores) {
          const cmp = compareAttempts(prior.scores, currVector);
          const html = renderRetestHtml(cmp, prior.attempt, attempt);
          setTimeout(() => {   // completion page renders after onComplete; inject next tick
            const el = document.getElementById("retest-summary");
            if (el) el.innerHTML = html;
          }, 0);
        }
      });

      landing.hidden = true;
      container.hidden = false;
      survey.render(container);
      container.setAttribute("tabindex", "-1");
      container.focus();
    });
  }

  const API = { makeToken, normalizeToken, nextAttempt, shuffle, scoreInstrument, buildResults, toCSVRow, scaleVector, pearson, spearman, compareAttempts };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);

  if (typeof document !== "undefined") {
    global.registerInstrument = registerInstrument;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startApp);
    else startApp();
  }
})(typeof window !== "undefined" ? window : globalThis);
