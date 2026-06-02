# Google Sheets Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send every completed assessment run to a central Google Sheet via an Apps Script web app, keeping the local JSON/CSV download as a silent fallback when submission fails.

**Architecture:** A new pure module `js/submit.js` flattens a `results` object into a name-addressed row and builds the POST payload; `core.js` calls it on completion and POSTs (text/plain, no CORS preflight) to an endpoint read from `js/config.js`. The endpoint + spam-guard `formId` are placeholders in committed source, substituted from GitHub Actions secrets at deploy. An Apps Script `doPost` validates the `formId`, serialises appends with `LockService`, and self-extends the sheet's columns by name so the random presentation order never scrambles columns.

**Tech Stack:** Vanilla JS (dual-export browser-global + Node CommonJS), `node:test`, Google Apps Script, GitHub Actions.

**Constraints:** Static host cannot keep client secrets (Actions secrets only keep them out of git source). No data loss on failed submit. Do NOT re-add the source-form PDFs. Do NOT `git push` until the full setup works locally and the user confirms.

**Test command (Node 26 local):** `node --test webapp/tests/*.test.js` (the glob is required — a bare directory arg fails on Node 26).

**Branch:** Implement on a local feature branch `feat/sheets-submission`; commit locally only.

---

### Task 0: Create the feature branch

**Files:** none (git only)

- [ ] **Step 1: Branch off main**

```bash
cd /Users/tf0011/Documents/Dev/ukdri-ssrc-workshop
git checkout -b feat/sheets-submission
```

- [ ] **Step 2: Confirm baseline tests pass**

Run: `node --test webapp/tests/*.test.js`
Expected: all tests pass (43 currently).

---

### Task 1: `flattenResults` + `buildSubmitPayload` (pure, in new `js/submit.js`)

**Files:**
- Create: `webapp/js/submit.js`
- Test: `webapp/tests/submit.test.js`

- [ ] **Step 1: Write the failing tests**

Create `webapp/tests/submit.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sub = require("../js/submit.js");

const sample = {
  participantToken: "BAKOR", attempt: 2, storagePersistent: true,
  timestamp: "2026-06-02T10:00:00.000Z", presentationOrder: ["phq9", "ess"],
  instruments: {
    phq9: { responses: [{ itemId: "q1", value: 2 }], scores: { total: 2 }, bands: { total: "minimal" } },
    ess: { responses: [{ itemId: "s1", value: 1 }], scores: { total: 1 }, bands: { total: "normal" } },
  },
};

test("flattenResults emits leading meta + per-instrument item/score/band keys", () => {
  const row = Sub.flattenResults(sample);
  assert.equal(row.participantToken, "BAKOR");
  assert.equal(row.attempt, 2);
  assert.equal(row.storagePersistent, true);
  assert.equal(row.timestamp, "2026-06-02T10:00:00.000Z");
  assert.equal(row.presentationOrder, "phq9|ess");
  assert.equal(row.phq9_item_q1, 2);
  assert.equal(row.phq9_score_total, 2);
  assert.equal(row.phq9_band_total, "minimal");
  assert.equal(row.ess_item_s1, 1);
  assert.equal(row.ess_score_total, 1);
});

test("flattenResults key SET is independent of presentation order", () => {
  const reordered = Object.assign({}, sample, { presentationOrder: ["ess", "phq9"] });
  const a = Object.keys(Sub.flattenResults(sample)).sort();
  const b = Object.keys(Sub.flattenResults(reordered)).sort();
  assert.deepEqual(a, b);
});

test("buildSubmitPayload wraps the row and includes formId", () => {
  const payload = Sub.buildSubmitPayload(sample, "form-123");
  assert.equal(payload.formId, "form-123");
  assert.equal(payload.row.participantToken, "BAKOR");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test webapp/tests/submit.test.js`
Expected: FAIL — `Cannot find module '../js/submit.js'`.

- [ ] **Step 3: Create `webapp/js/submit.js` with the pure functions**

```js
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

  const API = { flattenResults, buildSubmitPayload };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test webapp/tests/submit.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add webapp/js/submit.js webapp/tests/submit.test.js
git commit -m "feat(webapp): add flattenResults + buildSubmitPayload"
```

---

### Task 2: Refactor `toCSVRow` to reuse `flattenResults` (DRY)

**Files:**
- Modify: `webapp/js/core.js` (top: add submit require; body: `toCSVRow` ~line 113-125)
- Test: existing `webapp/tests/core.test.js` (must stay green)

- [ ] **Step 1: Add the submit module reference near the top of `core.js`**

Immediately after the existing scoring require block (the `const S = ...` block, ~line 7), add:

```js
  // submit.js is pure here (flattenResults); in the browser it attaches to window.
  const Sub = (typeof module !== "undefined" && module.exports)
    ? require("./submit.js")
    : global;
```

- [ ] **Step 2: Replace `toCSVRow` to build on `flattenResults`**

Replace the whole existing `toCSVRow` function body (lines ~113-125) with:

```js
  function toCSVRow(results) {
    const row = Sub.flattenResults(results);
    const header = Object.keys(row);
    return header.map(_csvEscape).join(",") + "\n" +
      header.map((k) => _csvEscape(row[k])).join(",") + "\n";
  }
```

(`_csvEscape` stays unchanged in `core.js`. Object insertion order equals the previous loop order, so column order is preserved.)

- [ ] **Step 3: Run the full suite to confirm no regression**

Run: `node --test webapp/tests/*.test.js`
Expected: PASS — all existing `toCSVRow` tests still pass, plus Task 1's submit tests.

- [ ] **Step 4: Commit**

```bash
git add webapp/js/core.js
git commit -m "refactor(webapp): toCSVRow reuses flattenResults (DRY)"
```

---

### Task 3: `postToSheet` + `shouldSubmit` (browser transport, injectable for tests)

**Files:**
- Modify: `webapp/js/submit.js`
- Test: `webapp/tests/submit.test.js`

- [ ] **Step 1: Add failing tests for `shouldSubmit` and `postToSheet`**

Append to `webapp/tests/submit.test.js`:

```js
test("shouldSubmit is false for empty or placeholder endpoints", () => {
  assert.equal(Sub.shouldSubmit(""), false);
  assert.equal(Sub.shouldSubmit(undefined), false);
  assert.equal(Sub.shouldSubmit("__SHEET_ENDPOINT__"), false);
  assert.equal(Sub.shouldSubmit("https://script.google.com/macros/s/abc/exec"), true);
});

test("postToSheet resolves {ok:true} when fetch returns ok body", async () => {
  const fakeFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  const r = await Sub.postToSheet("https://x/exec", { a: 1 }, { fetchImpl: fakeFetch });
  assert.deepEqual(r, { ok: true });
});

test("postToSheet resolves {ok:false} on HTTP error", async () => {
  const fakeFetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  const r = await Sub.postToSheet("https://x/exec", {}, { fetchImpl: fakeFetch });
  assert.deepEqual(r, { ok: false });
});

test("postToSheet resolves {ok:false} when fetch throws", async () => {
  const fakeFetch = () => Promise.reject(new Error("network"));
  const r = await Sub.postToSheet("https://x/exec", {}, { fetchImpl: fakeFetch });
  assert.deepEqual(r, { ok: false });
});

test("postToSheet resolves {ok:false} when body.ok is not true", async () => {
  const fakeFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: false }) });
  const r = await Sub.postToSheet("https://x/exec", {}, { fetchImpl: fakeFetch });
  assert.deepEqual(r, { ok: false });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test webapp/tests/submit.test.js`
Expected: FAIL — `Sub.shouldSubmit is not a function`.

- [ ] **Step 3: Implement `shouldSubmit` and `postToSheet` in `submit.js`**

Add these functions inside the IIFE (before the `const API = ...` line):

```js
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
```

Update the export line to:

```js
  const API = { flattenResults, buildSubmitPayload, shouldSubmit, postToSheet };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test webapp/tests/submit.test.js`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add webapp/js/submit.js webapp/tests/submit.test.js
git commit -m "feat(webapp): add shouldSubmit + postToSheet transport"
```

---

### Task 4: Runtime config file with placeholders

**Files:**
- Create: `webapp/js/config.js`

- [ ] **Step 1: Create `webapp/js/config.js`**

```js
// Runtime config. Placeholders are substituted from GitHub Actions secrets
// at deploy time (see .github/workflows/deploy-pages.yml). When left as
// placeholders (local dev / mis-deploy) the app skips submission and shows
// the local download buttons instead.
window.SHEET_ENDPOINT = "__SHEET_ENDPOINT__";
window.SHEET_FORM_ID = "__SHEET_FORM_ID__";
```

- [ ] **Step 2: Commit**

```bash
git add webapp/js/config.js
git commit -m "feat(webapp): add runtime config placeholders for sheet endpoint"
```

---

### Task 5: Wire submission into `core.js` completion + UI states

**Files:**
- Modify: `webapp/js/core.js` (`completedHtml` ~line 407-418; `onComplete` ~line 423-447)

- [ ] **Step 1: Update `completedHtml` to add a status line and hide the download buttons by default**

Replace these two lines in `completedHtml`:

```js
        '<button id="dl-json" class="primary" type="button">Download results (JSON)</button> ' +
        '<button id="dl-csv" class="primary" type="button">Download results (CSV)</button>' +
```

with:

```js
        '<div id="submit-status" class="muted">Saving…</div>' +
        '<div id="dl-buttons" hidden>' +
        '<p class="muted small">If saving online fails, download your results and send them to the organiser:</p>' +
        '<button id="dl-json" class="primary" type="button">Download results (JSON)</button> ' +
        '<button id="dl-csv" class="primary" type="button">Download results (CSV)</button>' +
        '</div>' +
```

- [ ] **Step 2: Add the submission call at the end of the `onComplete` handler**

Inside `survey.onComplete.add((sender) => { ... })`, after the existing retest block (after the `if (prior && prior.scores) { ... }` block, still inside the handler), add:

```js
        // Send this run to the central sheet; fall back to local download on failure.
        function finishSubmission(ok) {
          setTimeout(() => {   // completion page renders after onComplete; touch DOM next tick
            const status = document.getElementById("submit-status");
            const dl = document.getElementById("dl-buttons");
            if (ok) {
              if (status) status.textContent = "✓ Saved to the organisers' sheet.";
            } else {
              if (status) status.textContent =
                "Couldn't save online — a copy has downloaded. Please send it to the organiser.";
              if (dl) dl.hidden = false;
              download(latest.base + ".csv", toCSVRow(latest.results), "text/csv");
              download(latest.base + ".json", JSON.stringify(latest.results, null, 2), "application/json");
            }
          }, 0);
        }

        const endpoint = global.SHEET_ENDPOINT;
        if (Sub.shouldSubmit(endpoint)) {
          Sub.postToSheet(endpoint, Sub.buildSubmitPayload(results, global.SHEET_FORM_ID))
            .then((r) => finishSubmission(!!(r && r.ok)));
        } else {
          finishSubmission(false);
        }
```

- [ ] **Step 3: Confirm Node suite still passes (no DOM logic runs under Node)**

Run: `node --test webapp/tests/*.test.js`
Expected: PASS (unchanged count — these are browser-only paths).

- [ ] **Step 4: Commit**

```bash
git add webapp/js/core.js
git commit -m "feat(webapp): submit run to sheet on completion with download fallback"
```

---

### Task 6: Load config + submit in `index.html`; add transparency line

**Files:**
- Modify: `webapp/index.html` (script block ~line 47-56; intro ~line 22)

- [ ] **Step 1: Add the two new script tags before `core.js`**

In the script block, change:

```html
  <script src="js/survey-adapter.js"></script>
  <script src="js/core.js"></script>
```

to:

```html
  <script src="js/survey-adapter.js"></script>
  <script src="js/config.js"></script>
  <script src="js/submit.js"></script>
  <script src="js/core.js"></script>
```

- [ ] **Step 2: Add the transparency line after the anonymity paragraph**

After the existing `<p class="muted small">Your responses are anonymous. …</p>` (ends `…use the <strong>same</strong> ID on both visits.</p>`), insert:

```html
      <p class="muted small">Your anonymous responses are saved securely to the organisers' spreadsheet so we can measure the questionnaires' reliability.</p>
```

- [ ] **Step 3: Sanity-check the page loads with no console errors**

Run: open `webapp/index.html` (file:// or a local server) and confirm the landing renders, the ID badge shows, and the console has no errors (config.js + submit.js load before core.js).

- [ ] **Step 4: Commit**

```bash
git add webapp/index.html
git commit -m "feat(webapp): load config+submit scripts; add transparency line"
```

---

### Task 7: Apps Script web app (`Code.gs`) + setup README

**Files:**
- Create: `apps-script/Code.gs`
- Create: `apps-script/README.md`

> The `formId` for this project is **`ukdri-crt-2026-x7q2`**. Use the same value in `Code.gs`, the GitHub Actions secret `SHEET_FORM_ID`, and any local `config.js` used for testing.

- [ ] **Step 1: Create `apps-script/Code.gs`**

```javascript
// Bound Apps Script for the assessment sheet. Appends one row per submission.
// Deploy: Extensions > Apps Script > paste this > Deploy > New deployment >
// type "Web app", execute as "Me", access "Anyone". Copy the /exec URL.

var EXPECTED_FORM_ID = "ukdri-crt-2026-x7q2"; // must match SHEET_FORM_ID in the client

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // serialise concurrent submissions (everyone submits at once)
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || body.formId !== EXPECTED_FORM_ID) {
      return _json({ ok: false, error: "bad formId" });
    }
    var row = body.row || {};
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Read or initialise the header row.
    var lastCol = sheet.getLastColumn();
    var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

    // Add any columns this submission introduces (order-independent, by name).
    var changed = false;
    Object.keys(row).forEach(function (key) {
      if (header.indexOf(key) === -1) { header.push(key); changed = true; }
    });
    if (changed || lastCol === 0) {
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }

    // Build the values array in header-column order and append.
    var values = header.map(function (key) {
      return row.hasOwnProperty(key) ? row[key] : "";
    });
    sheet.appendRow(values);

    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Create `apps-script/README.md`**

```markdown
# Apps Script backend for the assessment sheet

This receives each completed run from the web-app and appends a row.

## One-time setup

1. Open the target Google Sheet.
2. **Extensions ▸ Apps Script**.
3. Delete any boilerplate and paste the contents of `Code.gs`.
4. Confirm `EXPECTED_FORM_ID` matches the client `SHEET_FORM_ID`
   (`ukdri-crt-2026-x7q2`). Save.
5. **Deploy ▸ New deployment ▸** select type **Web app**:
   - Description: `assessment intake`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. **Deploy**, authorise when prompted, and copy the **Web app URL**
   (ends in `/exec`).
7. In the GitHub repo: **Settings ▸ Secrets and variables ▸ Actions ▸
   New repository secret**, add:
   - `SHEET_ENDPOINT` = the `/exec` URL
   - `SHEET_FORM_ID` = `ukdri-crt-2026-x7q2`

## Re-deploying after edits

Apps Script keeps the same `/exec` URL only if you **Manage deployments ▸
edit the existing deployment ▸ new version**. Creating a *new* deployment
gives a new URL (update the secret if so).

## Notes
- The script self-extends columns by name, so the randomised instrument
  order never misaligns the sheet.
- `LockService` serialises appends so simultaneous submissions don't clobber.
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.gs apps-script/README.md
git commit -m "feat: add Apps Script intake backend + setup docs"
```

---

### Task 8: Inject secrets into config at deploy

**Files:**
- Modify: `.github/workflows/deploy-pages.yml` (insert a step before `upload-pages-artifact`, after `configure-pages`)

- [ ] **Step 1: Add the inject step**

Between the `Configure Pages` step and the `Upload the webapp as the Pages artifact` step, insert:

```yaml
      - name: Inject runtime config from secrets
        run: |
          sed -i "s#__SHEET_ENDPOINT__#${{ secrets.SHEET_ENDPOINT }}#" webapp/js/config.js
          sed -i "s#__SHEET_FORM_ID__#${{ secrets.SHEET_FORM_ID }}#" webapp/js/config.js
```

(`#` delimiter because the exec URL contains `/`; the values contain no `#` or `&`.)

- [ ] **Step 2: Validate the YAML parses**

Run: `node -e "const f=require('fs').readFileSync('.github/workflows/deploy-pages.yml','utf8'); if(!/Inject runtime config/.test(f)) throw new Error('step missing'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci: inject sheet endpoint + formId from Actions secrets at deploy"
```

---

### Task 9: Update webapp README

**Files:**
- Modify: `webapp/README.md`

- [ ] **Step 1: Add a "Data collection" section**

Add a section documenting: runs are submitted to a Google Sheet via the Apps Script in `apps-script/`; the endpoint + `formId` come from GitHub Actions secrets (`SHEET_ENDPOINT`, `SHEET_FORM_ID`); local JSON/CSV download is the fallback when submission fails; the sheet self-extends columns by name. Reference `apps-script/README.md` for setup.

```markdown
## Data collection (Google Sheets)

Each completed run is POSTed to a Google Apps Script web app that appends a
row to a central sheet (see `apps-script/README.md` for the one-time setup).
The endpoint URL and a shared `formId` are injected at deploy time from the
GitHub Actions secrets `SHEET_ENDPOINT` and `SHEET_FORM_ID` — committed source
holds placeholders only, because a static site cannot keep a real secret.

If submission fails (offline, endpoint down, or running locally without the
secrets), the completion screen reveals the local JSON/CSV download buttons
and auto-downloads a copy so no run is ever lost.
```

- [ ] **Step 2: Commit**

```bash
git add webapp/README.md
git commit -m "docs(webapp): document Google Sheets data collection"
```

---

### Task 10: Local end-to-end verification (manual, gated on user's Apps Script)

**Files:** none (manual). Requires the user to have deployed the Apps Script (Task 7) and shared the `/exec` URL.

- [ ] **Step 1: Verify the fallback path WITHOUT a real endpoint**

Serve the app locally (`python3 -m http.server` in `webapp/` or open `index.html`). With `config.js` still holding placeholders, complete a run. Expected: status shows the "Couldn't save online…" message, the download buttons appear, and a CSV+JSON download fires. (Use Playwright to drive a full run; `?debug=1` autofills.)

- [ ] **Step 2: Verify the success path WITH the real endpoint**

Temporarily set the real `/exec` URL and `formId` in a LOCAL-ONLY `webapp/js/config.js` (do NOT commit this with real values). Complete a run. Expected: status shows "✓ Saved to the organisers' sheet." and a new row appears in the Google Sheet with correct columns. Revert `config.js` to placeholders afterward.

- [ ] **Step 3: Confirm the sheet row content**

Open the sheet; confirm the header row has the expected columns (`participantToken`, `attempt`, `timestamp`, `presentationOrder`, per-instrument item/score/band columns) and the values match the run.

---

### Task 11: Push (ONLY after user confirms local success)

**Files:** none (git only)

- [ ] **Step 1: Confirm with the user that local end-to-end works and the GitHub secrets are set.**

- [ ] **Step 2: Merge to main and push**

```bash
git checkout main
git merge --no-ff feat/sheets-submission
node --test webapp/tests/*.test.js   # green gate before push
git push origin main
```

- [ ] **Step 3: After the Actions deploy finishes, complete one run on the live site and confirm a row lands in the sheet.**

---

## Self-Review

**Spec coverage:**
- Transport (Apps Script `doPost`) → Task 7. ✓
- `submit.js` pure `flattenResults`/`buildSubmitPayload` → Task 1; `postToSheet`/`shouldSubmit` → Task 3. ✓
- DRY `toCSVRow` refactor → Task 2. ✓
- `config.js` placeholders → Task 4. ✓
- `core.js` completion wiring + UI states (Saving / ✓ Saved / fallback download) → Task 5. ✓
- index.html script order + transparency line → Task 6. ✓
- Deploy-time secret injection → Task 8. ✓
- LockService + self-extending columns + formId guard → Task 7. ✓
- Error handling (timeout, non-2xx, throw, placeholder skip) → Tasks 3 & 5. ✓
- README → Task 9. ✓
- Local-first, no push until confirmed → Tasks 0, 10, 11. ✓

**Placeholder scan:** The only `__…__` tokens are intentional runtime placeholders, not plan gaps. No TODO/TBD steps.

**Type consistency:** `flattenResults`, `buildSubmitPayload(results, formId)`, `shouldSubmit(endpoint)`, `postToSheet(endpoint, payload, opts)`, payload shape `{ formId, row }`, and `global.SHEET_ENDPOINT`/`global.SHEET_FORM_ID` are used identically across Tasks 1, 3, 5, 7, 8. `Sub.*` namespace consistent in `core.js`.
