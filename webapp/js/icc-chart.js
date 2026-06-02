/* Shared "reliability vs repeated observations" explainer chart.
   Interactive chart created by Ciro Della Monica (University of Surrey).
   Self-contained: injects its own styles and builds markup into a host element,
   so both the standalone /icc page and the dashboard's ICC tab render identically.
   Requires Chart.js (vendor/chart.umd.min.js) to be loaded first. */
(function (global) {
  "use strict";

  var STYLE_ID = "icc-chart-style";
  var CSS =
    ".icc-title{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.08rem;line-height:1.3;color:var(--accent-deep);margin:0 0 1.1rem;max-width:62ch}" +
    ".icc-legend{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:1.4rem;font-size:13px;color:var(--ink-soft)}" +
    ".icc-legend>span{display:flex;align-items:center;gap:6px}" +
    ".icc-legend .sw{width:28px;height:3px;border-radius:2px;display:inline-block}" +
    ".icc-canvas-wrap{position:relative;width:100%;height:320px}" +
    ".icc-scenario{margin-top:1.5rem;padding:1rem 1.25rem;background:#f1ece2;border-radius:12px;border:1px solid var(--rule)}" +
    ".icc-scenario-title{margin:0 0 .75rem;font-size:13px;font-weight:600;color:var(--ink)}" +
    ".icc-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}" +
    ".icc-controls label{font-size:13px;color:var(--ink-soft)}" +
    ".icc-controls input[type=range]{flex:1;min-width:120px;accent-color:var(--accent)}" +
    ".icc-val{font-size:14px;font-weight:600;min-width:36px;color:var(--ink)}" +
    ".icc-msg{margin-top:8px;font-size:13px;color:var(--ink-soft)}";

  var MARKUP =
    '<p class="icc-title">Interactive chart showing how measurement error decreases toward true state as the number of repeated observations increases, for instruments with different test-retest reliability levels.</p>' +
    '<div class="icc-legend">' +
    '<span><span class="sw" style="background:#E24B4A"></span>Poor reliability (ICC = 0.40)</span>' +
    '<span><span class="sw" style="background:#EF9F27"></span>Moderate reliability (ICC = 0.70)</span>' +
    '<span><span class="sw" style="background:#1D9E75"></span>Good reliability (ICC = 0.90)</span>' +
    '</div>' +
    '<div class="icc-canvas-wrap"><canvas class="icc-canvas" role="img" aria-label="Line chart of absolute error from true state (y-axis) versus number of repeated observations (x-axis). Three curves: poor reliability (ICC=0.40) decreases slowly; moderate (ICC=0.70) at a medium rate; good (ICC=0.90) starts lower and flattens quickly toward zero.">Reliability curves showing error decreasing with more observations.</canvas></div>' +
    '<div class="icc-scenario">' +
    '<p class="icc-scenario-title">Explore a scenario</p>' +
    '<div class="icc-controls">' +
    '<label>ICC of your instrument</label>' +
    '<input type="range" min="0.2" max="0.98" step="0.01" value="0.70" class="icc-slider" />' +
    '<span class="icc-val">0.70</span>' +
    '</div><div class="icc-msg"></div></div>';

  function errCurve(icc, n) {
    return (Math.sqrt(1 - icc) * 1.0) / Math.sqrt(n);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Build the explainer chart into `host`. Idempotent — a second call is a no-op,
  // so it is safe to call on every tab activation.
  function renderIccExplainer(host) {
    if (!host || host.dataset.iccInit === "1") return;
    if (!global.Chart) return; // Chart.js not loaded yet
    host.dataset.iccInit = "1";
    injectStyle();
    host.innerHTML = MARKUP;

    var nObs = Array.from({ length: 20 }, function (_, i) { return i + 1; });
    var dataset = function (icc, color, label) {
      return {
        label: label,
        data: nObs.map(function (n) { return parseFloat(errCurve(icc, n).toFixed(3)); }),
        borderColor: color, backgroundColor: color + "18", borderWidth: 2.5,
        pointRadius: 3, pointBackgroundColor: color, tension: 0.4, fill: false,
      };
    };

    var ctx = host.querySelector(".icc-canvas").getContext("2d");
    var chart = new global.Chart(ctx, {
      type: "line",
      data: {
        labels: nObs,
        datasets: [
          dataset(0.40, "#E24B4A", "Poor (ICC=0.40)"),
          dataset(0.70, "#EF9F27", "Moderate (ICC=0.70)"),
          dataset(0.90, "#1D9E75", "Good (ICC=0.90)"),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return items[0].label + " observation" + (items[0].label > 1 ? "s" : ""); },
              label: function (item) { return " " + item.dataset.label + ": error = " + item.formattedValue; },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Number of repeated observations", font: { size: 12 }, color: "#888" },
            ticks: { color: "#888", font: { size: 11 }, autoSkip: false, maxRotation: 0,
              callback: function (v, i) { return (i + 1) % 5 === 0 || i === 0 ? nObs[i] : ""; } },
          },
          y: {
            min: 0, max: 0.85,
            title: { display: true, text: "Absolute error from true state", font: { size: 12 }, color: "#888" },
            ticks: { color: "#888", font: { size: 11 }, callback: function (v) { return v.toFixed(2); } },
            grid: { color: "rgba(136,135,128,0.12)" },
          },
        },
      },
    });

    var slider = host.querySelector(".icc-slider");
    var iccVal = host.querySelector(".icc-val");
    var iccMsg = host.querySelector(".icc-msg");

    var nToThreshold = function (icc, threshold) {
      for (var n = 1; n <= 50; n++) { if (errCurve(icc, n) <= threshold) return n; }
      return ">50";
    };
    var updateMsg = function (icc) {
      var n = nToThreshold(icc, 0.15);
      var quality = icc >= 0.85 ? "good" : icc >= 0.60 ? "moderate" : "poor";
      iccMsg.textContent = "With ICC = " + icc.toFixed(2) + " (" + quality + " reliability), you need " +
        n + " observation" + (n === 1 ? "" : "s") + " to bring average error below 0.15.";
    };
    var updateChart = function (icc) {
      var color = icc >= 0.85 ? "#1D9E75" : icc >= 0.60 ? "#EF9F27" : "#E24B4A";
      var data = nObs.map(function (n) { return parseFloat(errCurve(icc, n).toFixed(3)); });
      var existing = chart.data.datasets.find(function (d) { return d.label && d.label.indexOf("Your") === 0; });
      if (existing) {
        existing.data = data; existing.borderColor = color; existing.pointBackgroundColor = color;
        existing.label = "Your instrument (ICC=" + icc.toFixed(2) + ")";
      } else {
        chart.data.datasets.push({
          label: "Your instrument (ICC=" + icc.toFixed(2) + ")", data: data,
          borderColor: color, borderWidth: 2, borderDash: [6, 3], pointRadius: 0, tension: 0.4, fill: false,
        });
      }
      chart.update("none");
    };

    slider.addEventListener("input", function () {
      var icc = parseFloat(slider.value);
      iccVal.textContent = icc.toFixed(2);
      updateMsg(icc); updateChart(icc);
    });
    updateMsg(0.70); updateChart(0.70);
    return chart;
  }

  global.renderIccExplainer = renderIccExplainer;
})(window);
