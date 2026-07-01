# UKDRI CR&T Assessment Battery

Test–retest reliability tool built for the **UK DRI CR&T Centre Meeting (1 July 2026)**.  
Live site → **https://andreifoldes.github.io/ukdri-crt-assessments/**

## What it does

Participants complete five self-report questionnaires **twice** during the workshop. The live dashboard shows reliability statistics (ICC, Bland–Altman) building up in real time as runs come in, turning the data collection itself into a demonstration of test–retest reliability.

### Pages

| Page | URL |
|------|-----|
| Assessment battery | `/` |
| Live reliability dashboard | `/dashboard.html` |
| Why reliability matters (ICC explainer) | `/icc.html` |

The ICC explainer is accompanied by the preprint: [medRxiv 2026.06.12.26355520](https://www.medrxiv.org/content/10.64898/2026.06.12.26355520v1.full-text)

## Instruments

PSQI · HADS · Lawton IADL · ESS · PHQ-9 — presented in random order, scored locally in the browser, submitted anonymously to a Google Sheet.

## Repo structure

```
webapp/          # The Pages site (HTML/CSS/JS, vendored SurveyJS + D3)
apps-script/     # Google Apps Script backend (doPost intake + doGet read-back)
analysis/        # Synthetic dataset generator for dashboard testing
.github/
  workflows/
    deploy-pages.yml   # CI: run tests → inject secrets → deploy to Pages
```

## Deployment

Push to `main` → GitHub Actions runs the test suite, injects `SHEET_ENDPOINT` and `SHEET_FORM_ID` from repository secrets, and deploys `webapp/` to GitHub Pages.

Required repository secrets (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `SHEET_ENDPOINT` | Apps Script `/exec` URL |
| `SHEET_FORM_ID` | `ukdri-crt-2026-x7q2` |

See [`apps-script/README.md`](apps-script/README.md) for the one-time Apps Script setup and [`webapp/README.md`](webapp/README.md) for development notes, scoring details, and how to run tests.

## Tests

```bash
node --test webapp/tests/*.test.js
```
