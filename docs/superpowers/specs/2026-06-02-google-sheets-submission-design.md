# Google Sheets Submission — Design Spec

**Date:** 2026-06-02
**Component:** `webapp/` self-report assessment battery
**Goal:** Send every completed assessment run to a central Google Sheet automatically, while preserving the local JSON/CSV export as a silent fallback when submission fails.

---

## Motivation

The app is a static GitHub Pages site (`andreifoldes/ukdri-crt-assessments`) with no backend. Today each completed run only produces a local JSON/CSV download — fine for a single device, but the organiser cannot aggregate ~20–30 participants × 2 attempts without collecting files by hand. Sending each run to one Google Sheet makes the sheet the single source of truth for the post-workshop reliability analysis.

## Constraints

- **No server.** The browser must POST directly to a Google endpoint.
- **Static hosting cannot keep secrets.** Anything in the served JS is publicly readable (Network/Sources tab). GitHub Actions secrets only keep values out of the *git source*; they are still public in the deployed asset. So no value sent from the client is truly secret.
- **No data loss.** A failed submission must never silently lose a run.
- **Anonymity preserved.** Data remains pseudonymous (5-letter token); no new identifying fields.
- **Do not re-add the source-form PDFs** (copyright — unchanged constraint).

## Decisions (approved)

| Decision | Choice |
|---|---|
| Transport | **Google Apps Script web app** (`doPost` appends a row). Free, organiser-owned, no third party. |
| Local export | **Silent fallback** — submit automatically; only surface/trigger the local download if the POST fails. |
| Config handling | **Inject from GitHub Actions secrets at deploy.** Committed source holds placeholders; deploy workflow substitutes real values. |
| Spam guard | **Yes** — a shared `formId` in client + script; the script drops rows missing/mismatching it. Weak (public) but filters accidental noise. |
| Transparency copy | **Yes** — one muted line on the intro that responses are saved to the organisers' sheet. |

---

## Architecture & data flow

```
participant finishes run
  → core.js onComplete builds `results` (existing)
  → submit.js: buildSubmitPayload(results, formId)  [pure]
  → submit.js: postToSheet(endpoint, payload)        [browser, 4s timeout]
        success {ok:true}  → completion shows "✓ Saved"; download buttons stay hidden
        failure / timeout  → reveal download buttons + message; auto-trigger CSV+JSON download
  → Apps Script doPost: validate formId, append one row to the sheet
```

The Apps Script keeps a header row and appends one **flat row per submission** whose columns match the existing CSV schema, but addressed **by name** (not position) so the random presentation order does not scramble columns.

## Components

### 1. `webapp/js/submit.js` (new) — dual-export (browser global + Node CommonJS)

Pure, unit-tested:

- `flattenResults(results)` → ordered plain object `{ columnName: value }`. Reuses the column-naming convention already in `toCSVRow` (`<id>_item_<itemId>`, `<id>_score_<k>`, `<id>_band_<k>`) plus the five leading meta fields (`participantToken`, `attempt`, `storagePersistent`, `timestamp`, `presentationOrder` joined by `|`). Column **set** is identical regardless of `presentationOrder`; only insertion order varies, which is irrelevant for a name-addressed payload.
- `buildSubmitPayload(results, formId)` → `{ formId, row: flattenResults(results) }`.

**DRY refactor:** `toCSVRow` is refactored to build on `flattenResults` (single source of truth for the column mapping). Existing `toCSVRow` tests must stay green.

Browser-only (not in Node export):

- `postToSheet(endpoint, payload, timeoutMs = 4000)` → `Promise<{ok: boolean}>`.
  - `fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })`.
  - **CORS:** `text/plain` makes this a "simple request" with no preflight (Apps Script rejects preflighted requests). The Apps Script response (after Google's redirect to `script.googleusercontent.com`) is readable cross-origin.
  - Timeout via `AbortController`.
  - Resolves `{ok:true}` only when the HTTP response is OK **and** parses to `{ok:true}`. Any throw, timeout, non-2xx, or unparseable/`ok!==true` body resolves `{ok:false}` — caller falls back to local download (no data lost even if response reading fails).

### 2. `webapp/js/config.js` (new)

```js
window.SHEET_ENDPOINT = "__SHEET_ENDPOINT__";
window.SHEET_FORM_ID = "__SHEET_FORM_ID__";
```

Committed with placeholders. The deploy workflow substitutes real values. If `SHEET_ENDPOINT` is empty or still the literal placeholder (e.g. local dev without substitution), `core.js` **skips the POST** and behaves as the failure path (download buttons shown) — so local testing and a mis-deploy both degrade gracefully.

### 3. `webapp/index.html` — script order + transparency line

Add, after `survey-adapter.js` and before `core.js`:

```html
<script src="js/config.js"></script>
<script src="js/submit.js"></script>
```

(`config.js` and `submit.js` must load before `core.js`, which reads `window.SHEET_ENDPOINT` and calls `postToSheet`/`buildSubmitPayload`.)

Add one muted line in the landing intro (near the existing anonymity paragraph):

> Your anonymous responses are saved securely to the organisers' spreadsheet so we can measure the questionnaires' reliability.

### 4. `webapp/js/core.js` — completion hook + UI states

In `survey.onComplete` (after `buildResults`, currently line ~431):

- After computing `results` and `latest`, call submission:
  - If `SHEET_ENDPOINT` missing/placeholder → treat as failure path immediately.
  - Else `postToSheet(SHEET_ENDPOINT, buildSubmitPayload(results, SHEET_FORM_ID))`.
- The retest comparison logic is unchanged and runs regardless of submission outcome.

`completedHtml` changes:

- Add `<div id="submit-status" class="muted">Saving…</div>`.
- Wrap the two existing download buttons in `<div id="dl-buttons" hidden> … </div>` (hidden by default).
- On submit resolve (injected next tick, like the retest summary):
  - **success** → `#submit-status` = "✓ Saved to the organisers' sheet." `#dl-buttons` stays hidden.
  - **failure** → `#submit-status` = "Couldn't save online. A copy has downloaded — please send it to the organiser." Reveal `#dl-buttons` and auto-trigger the CSV + JSON download (in case the auto-download is blocked, the buttons remain).

### 5. `apps-script/Code.gs` (new, not served) + `apps-script/README.md`

`doPost(e)`:

- `const body = JSON.parse(e.postData.contents)`.
- Reject if `body.formId !== EXPECTED_FORM_ID` → return `{ok:false, error:"bad formId"}`.
- `LockService.getScriptLock()` with `waitLock(20000)` — **required**, because ~20–30 participants may submit near-simultaneously and concurrent appends would otherwise race/clobber.
- Open the bound sheet. Read header row. For each key in `body.row` not already a column, append it to the header. Build the output row in header-column order. `appendRow`.
- `releaseLock()`.
- Return `ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON)`.

`EXPECTED_FORM_ID` is a constant in the script (server-side — the one value that genuinely lives off-client).

`apps-script/README.md`: step-by-step — create sheet → Extensions ▸ Apps Script → paste `Code.gs` → set `EXPECTED_FORM_ID` → Deploy as Web app (execute as you, access "Anyone") → copy the `/exec` URL → add `SHEET_ENDPOINT` and `SHEET_FORM_ID` as GitHub Actions repo secrets.

### 6. `.github/workflows/deploy-pages.yml` — inject step

Before `upload-pages-artifact`, add:

```yaml
- name: Inject runtime config
  run: |
    sed -i "s#__SHEET_ENDPOINT__#${{ secrets.SHEET_ENDPOINT }}#" webapp/js/config.js
    sed -i "s#__SHEET_FORM_ID__#${{ secrets.SHEET_FORM_ID }}#" webapp/js/config.js
```

`#` delimiter because the exec URL contains `/`. Values are organiser-controlled and contain no `#` or `&`. The test job (`node --test webapp/tests/*.test.js`) is unchanged and still gates the deploy; tests only touch pure functions, so placeholders never affect them.

## Error handling

| Failure | Behaviour |
|---|---|
| Endpoint unset/placeholder (local/mis-deploy) | Skip POST; show download buttons immediately. |
| Network error / timeout (4s) / non-2xx / `ok!==true` | Reveal download buttons + message; auto-trigger CSV+JSON download. No data lost. |
| Concurrent submissions | `LockService` serialises appends server-side. |
| Junk POST to public endpoint | `formId` mismatch → row dropped server-side. |

## Testing

- **Node unit tests** (`webapp/tests/submit.test.js`):
  - `flattenResults` emits the expected keys (meta + per-instrument item/score/band columns) for a sample `results` object.
  - Column **set** is identical across two different `presentationOrder`s of the same data.
  - `buildSubmitPayload` wraps the row and includes `formId`.
  - Existing `toCSVRow` tests stay green after the DRY refactor.
- **Manual / Playwright** against a real test deployment:
  - Complete a run → a row appears in the sheet → completion shows "✓ Saved".
  - Point `SHEET_ENDPOINT` at an unreachable URL → completion reveals buttons + auto-downloads (fallback verified).

## Out of scope (YAGNI)

- Editing/deduping rows server-side (the analysis script pairs by `participantToken` + `attempt`).
- Real abuse protection (impossible client-side on a static host; `formId` + manual cleanup suffice for a workshop).
- Storing the source-form PDFs anywhere in the repo (unchanged hard constraint).
