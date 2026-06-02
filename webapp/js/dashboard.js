/* Live reliability dashboard. Fetches the assessment sheet (via the Apps Script
   doGet), computes test-retest ICCs and cross-instrument agreement with stats.js,
   and draws forest / scatter / Bland-Altman plots with D3. Polls every 20s so the
   room watches reliability build up as runs land. Browser-only (depends on d3,
   window.Stats, window.SHEET_ENDPOINT). */
(function () {
  "use strict";
  const St = window.Stats;
  const POLL_MS = 20000;
  const FIXTURE = "tests/fixtures/sample-rows.json";

  // Okabe-Ito-derived colours (consistent with css/styles.css). Band colour is a
  // redundant cue: the forest plot also labels each band in words.
  const BAND_COLOR = { poor: "#D55E00", fair: "#E69F00", good: "#0072B2", excellent: "#009E73", "n/a": "#999" };
  const POINT = "#0072B2";

  let state = { rows: [], updated: null, ok: false, scale: St.SCALES[0].key, pair: St.CONVERGENT[0].id, tab: "retest" };

  // ---------- data ----------
  function endpoint() {
    const e = window.SHEET_ENDPOINT;
    return (typeof e === "string" && e.length && e.indexOf("__SHEET_ENDPOINT__") === -1) ? e : null;
  }

  function fetchRows() {
    const url = endpoint() || FIXTURE;
    return fetch(url, { method: "GET" })
      .then((r) => r.json())
      .then((body) => (body && body.ok && Array.isArray(body.rows)) ? body.rows : []);
  }

  function refresh() {
    fetchRows()
      .then((raw) => { state.rows = St.parseRows(raw); state.updated = new Date(); state.ok = true; render(); })
      .catch(() => { state.ok = false; renderStatus(); });
  }

  // ---------- formatting ----------
  const fmt2 = (x) => (x === null || x === undefined || !isFinite(x)) ? "—" : x.toFixed(2);
  const pad = (n) => String(n).padStart(2, "0");
  function clockStr(d) { return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : "—"; }

  // ---------- small D3 helpers ----------
  function freshSvg(sel, w, h) {
    const root = d3.select(sel);
    root.selectAll("*").remove();
    return root.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("class", "chart");
  }
  function emptyNote(sel, msg) {
    d3.select(sel).selectAll("*").remove();
    d3.select(sel).append("p").attr("class", "empty").text(msg);
  }
  // Deterministic sub-unit jitter to separate integer-valued points.
  const jitter = (i) => ((i * 2654435761) % 1000 / 1000 - 0.5) * 0.3;
  function lsLine(xs, ys) {
    const n = xs.length, mx = d3.mean(xs), my = d3.mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den === 0) return null;
    const slope = num / den;
    return { slope, intercept: my - slope * mx };
  }

  // ---------- forest plot of per-scale ICCs ----------
  function renderForest() {
    const sel = "#forest";
    const data = St.SCALES.map((s) => {
      const r = St.icc21(St.retestPairs(state.rows, s.key));
      return { label: s.label, key: s.key, ...r, band: St.iccBand(r.icc) };
    });
    if (data.every((d) => d.n < 2)) { emptyNote(sel, "Waiting for participants with two completed attempts…"); return; }

    const m = { t: 28, r: 112, b: 40, l: 120 };
    const rowH = 34, w = 760, h = m.t + m.b + data.length * rowH;
    const svg = freshSvg(sel, w, h);
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, w - m.r]);

    // qualitative reference bands (Cicchetti, 1994)
    const bands = [[0, 0.40, "#D55E00"], [0.40, 0.60, "#E69F00"], [0.60, 0.75, "#0072B2"], [0.75, 1, "#009E73"]];
    svg.append("g").selectAll("rect").data(bands).join("rect")
      .attr("x", (d) => x(d[0])).attr("width", (d) => x(d[1]) - x(d[0]))
      .attr("y", m.t - 6).attr("height", h - m.t - m.b + 6)
      .attr("fill", (d) => d[2]).attr("opacity", 0.06);
    svg.append("g").selectAll("line.grid").data([0.40, 0.60, 0.75]).join("line")
      .attr("class", "grid").attr("x1", (d) => x(d)).attr("x2", (d) => x(d))
      .attr("y1", m.t - 6).attr("y2", h - m.b).attr("stroke", "#ccc").attr("stroke-dasharray", "3 3");

    // x axis
    svg.append("g").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(6)).attr("class", "axis");
    svg.append("text").attr("class", "axis-label").attr("x", (m.l + w - m.r) / 2).attr("y", h - 6)
      .attr("text-anchor", "middle").text("ICC(2,1) — test-retest agreement (95% CI)");

    const rows = svg.append("g").selectAll("g.row").data(data).join("g")
      .attr("class", "row").attr("transform", (d, i) => `translate(0,${m.t + i * rowH + rowH / 2})`);
    rows.append("text").attr("class", "scale-name").attr("x", m.l - 12).attr("dy", "0.32em")
      .attr("text-anchor", "end").text((d) => d.label);

    const enough = (d) => d.n >= 2 && d.icc !== null;
    rows.filter((d) => !enough(d)).append("text").attr("class", "insufficient")
      .attr("x", x(0.02)).attr("dy", "0.32em").text((d) => `n = ${d.n} — need ≥2 paired`);

    const ok = rows.filter(enough);
    ok.append("line").attr("class", "ci")
      .attr("x1", (d) => x(Math.max(0, d.lo === null ? d.icc : d.lo)))
      .attr("x2", (d) => x(Math.min(1, d.hi === null ? d.icc : d.hi)))
      .attr("stroke", (d) => BAND_COLOR[d.band]).attr("stroke-width", 2);
    ok.append("circle").attr("cx", (d) => x(Math.max(0, Math.min(1, d.icc)))).attr("r", 6)
      .attr("fill", (d) => BAND_COLOR[d.band]);
    ok.append("text").attr("class", "icc-val").attr("x", w - 8).attr("dy", "0.32em")
      .attr("text-anchor", "end").text((d) => `${fmt2(d.icc)}  (n=${d.n})`);
  }

  // ---------- scatter (generic) ----------
  function scatter(sel, pts, opts) {
    const m = { t: 30, r: 18, b: 48, l: 52 }, w = 380, h = 340;
    if (!pts.length) { emptyNote(sel, opts.empty || "No data yet."); return; }
    const svg = freshSvg(sel, w, h);
    const x = d3.scaleLinear().domain(opts.xDomain).nice().range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain(opts.yDomain).nice().range([h - m.b, m.t]);

    svg.append("g").attr("transform", `translate(0,${h - m.b})`).attr("class", "axis").call(d3.axisBottom(x).ticks(6));
    svg.append("g").attr("transform", `translate(${m.l},0)`).attr("class", "axis").call(d3.axisLeft(y).ticks(6));
    svg.append("text").attr("class", "axis-label").attr("x", (m.l + w - m.r) / 2).attr("y", h - 10).attr("text-anchor", "middle").text(opts.xLabel);
    svg.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -(m.t + h - m.b) / 2).attr("y", 14).attr("text-anchor", "middle").text(opts.yLabel);
    if (opts.title) svg.append("text").attr("class", "panel-title").attr("x", m.l).attr("y", 18).text(opts.title);

    if (opts.identity) {
      const lo = Math.max(opts.xDomain[0], opts.yDomain[0]), hi = Math.min(opts.xDomain[1], opts.yDomain[1]);
      svg.append("line").attr("class", "ref identity").attr("x1", x(lo)).attr("y1", y(lo)).attr("x2", x(hi)).attr("y2", y(hi));
    }
    if (opts.fit) {
      const f = lsLine(pts.map((p) => p.x), pts.map((p) => p.y));
      if (f) {
        const x0 = opts.xDomain[0], x1 = opts.xDomain[1];
        svg.append("line").attr("class", "ref fit")
          .attr("x1", x(x0)).attr("y1", y(f.intercept + f.slope * x0))
          .attr("x2", x(x1)).attr("y2", y(f.intercept + f.slope * x1));
      }
    }
    svg.append("g").selectAll("circle").data(pts).join("circle")
      .attr("cx", (d, i) => x(d.x + (opts.jitter ? jitter(i) : 0)))
      .attr("cy", (d, i) => y(d.y + (opts.jitter ? jitter(i + 7) : 0)))
      .attr("r", 5).attr("fill", POINT).attr("opacity", 0.7).attr("stroke", "#fff").attr("stroke-width", 0.8)
      .append("title").text((d) => d.token ? `${d.token}: (${d.x}, ${d.y})` : `(${d.x}, ${d.y})`);
  }

  // ---------- Bland-Altman ----------
  function blandAltman(sel, xs, ys, opts) {
    const m = { t: 30, r: 18, b: 48, l: 52 }, w = 380, h = 340;
    if (xs.length < 2) { emptyNote(sel, opts.empty || "Need at least two pairs."); return; }
    const ba = St.blandAltman(xs, ys);
    const svg = freshSvg(sel, w, h);
    const yMax = Math.max(Math.abs(ba.hiLoA), Math.abs(ba.loLoA), d3.max(ba.diff.map(Math.abs))) * 1.15 || 1;
    const x = d3.scaleLinear().domain(d3.extent(ba.mean)).nice().range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([-yMax, yMax]).nice().range([h - m.b, m.t]);

    svg.append("g").attr("transform", `translate(0,${h - m.b})`).attr("class", "axis").call(d3.axisBottom(x).ticks(6));
    svg.append("g").attr("transform", `translate(${m.l},0)`).attr("class", "axis").call(d3.axisLeft(y).ticks(6));
    svg.append("text").attr("class", "axis-label").attr("x", (m.l + w - m.r) / 2).attr("y", h - 10).attr("text-anchor", "middle").text(opts.xLabel);
    svg.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -(m.t + h - m.b) / 2).attr("y", 14).attr("text-anchor", "middle").text(opts.yLabel);
    if (opts.title) svg.append("text").attr("class", "panel-title").attr("x", m.l).attr("y", 18).text(opts.title);

    const refs = [{ v: ba.bias, c: "bias", t: `bias ${fmt2(ba.bias)}` }, { v: ba.hiLoA, c: "loa", t: `+1.96 SD ${fmt2(ba.hiLoA)}` }, { v: ba.loLoA, c: "loa", t: `−1.96 SD ${fmt2(ba.loLoA)}` }];
    const g = svg.append("g").selectAll("g.ref").data(refs).join("g");
    g.append("line").attr("class", (d) => `ref ${d.c}`).attr("x1", m.l).attr("x2", w - m.r).attr("y1", (d) => y(d.v)).attr("y2", (d) => y(d.v));
    g.append("text").attr("class", "ref-label").attr("x", w - m.r).attr("y", (d) => y(d.v) - 4).attr("text-anchor", "end").text((d) => d.t);

    svg.append("g").selectAll("circle").data(ba.mean.map((mv, i) => ({ mv, dv: ba.diff[i] }))).join("circle")
      .attr("cx", (d, i) => x(d.mv) + jitter(i) * 4).attr("cy", (d) => y(d.dv))
      .attr("r", 5).attr("fill", POINT).attr("opacity", 0.7).attr("stroke", "#fff").attr("stroke-width", 0.8);
  }

  // ---------- tab renderers ----------
  function renderRetestDetail() {
    const s = St.SCALES.find((d) => d.key === state.scale);
    const pairs = St.retestPairs(state.rows, state.scale);
    const r = St.icc21(pairs);
    const pts = pairs.map((p) => ({ x: p.a1, y: p.a2, token: p.token }));
    const corr = pairs.length >= 2 ? St.pearson(pairs.map((p) => p.a1), pairs.map((p) => p.a2)) : null;
    scatter("#scatter", pts, {
      xDomain: [0, s.max], yDomain: [0, s.max], xLabel: "Attempt 1", yLabel: "Attempt 2",
      identity: true, jitter: true,
      title: `${s.label}  ·  ICC ${fmt2(r.icc)}  ·  r ${fmt2(corr)}`,
      empty: "No participant has two attempts for this scale yet.",
    });
    blandAltman("#ba", pairs.map((p) => p.a1), pairs.map((p) => p.a2), {
      xLabel: "Mean of the two attempts", yLabel: "Attempt 1 − Attempt 2",
      title: `${s.label}  ·  test-retest`, empty: "Need ≥2 participants with two attempts.",
    });
  }

  function renderConvergent() {
    const c = St.CONVERGENT.find((d) => d.id === state.pair);
    const sx = St.SCALES.find((s) => s.key === c.x), sy = St.SCALES.find((s) => s.key === c.y);
    const { xs, ys, tokens } = St.convergentPairs(state.rows, c.x, c.y);
    const pts = xs.map((xv, i) => ({ x: xv, y: ys[i], token: tokens[i] }));
    const corr = xs.length >= 2 ? St.pearson(xs, ys) : null;
    scatter("#conv-scatter", pts, {
      xDomain: [0, sx.max], yDomain: [0, sy.max], xLabel: sx.label, yLabel: sy.label,
      fit: true, jitter: true, title: `${c.label}  ·  r ${fmt2(corr)}  (n=${xs.length})`,
      empty: "No participant has both scores yet.",
    });
    // Standardised Bland-Altman: scores live on different ranges, so compare z-scores.
    blandAltman("#conv-ba", St.zscore(xs), St.zscore(ys), {
      xLabel: "Mean (standardised)", yLabel: `${sx.label} − ${sy.label} (SD units)`,
      title: "Standardised agreement", empty: "Need ≥2 participants with both scores.",
    });
  }

  // ---------- shell ----------
  function renderStatus() {
    const pairsN = St.retestPairs(state.rows, state.scale).length;
    d3.select("#run-count").text(state.rows.length);
    d3.select("#pair-count").text(pairsN);
    d3.select("#last-updated").text(clockStr(state.updated));
    d3.select("#status").classed("stale", !state.ok).text(state.ok ? "live" : "couldn't refresh — showing last data");
    d3.select("#source").text(endpoint() ? "Google Sheet" : "sample data (no live endpoint)");
  }

  function render() {
    renderStatus();
    d3.selectAll(".tab").classed("active", function () { return this.dataset.tab === state.tab; });
    d3.select("#panel-retest").classed("hidden", state.tab !== "retest");
    d3.select("#panel-convergent").classed("hidden", state.tab !== "convergent");
    if (state.tab === "retest") { renderForest(); renderRetestDetail(); }
    else renderConvergent();
  }

  // ---------- init ----------
  function init() {
    const scaleSel = d3.select("#scale-select");
    scaleSel.selectAll("option").data(St.SCALES).join("option").attr("value", (d) => d.key).text((d) => d.label);
    scaleSel.on("change", function () { state.scale = this.value; render(); });

    const pairSel = d3.select("#pair-select");
    pairSel.selectAll("option").data(St.CONVERGENT).join("option").attr("value", (d) => d.id).text((d) => d.label);
    pairSel.on("change", function () { state.pair = this.value; render(); });

    d3.selectAll(".tab").on("click", function () { state.tab = this.dataset.tab; render(); });

    refresh();
    setInterval(refresh, POLL_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
