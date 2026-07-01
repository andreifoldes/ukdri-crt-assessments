// Runtime config. Placeholders are substituted from GitHub Actions secrets
// at deploy time (see .github/workflows/deploy-pages.yml). When left as
// placeholders (local dev / mis-deploy) the app skips submission and shows
// the local download buttons instead.
window.SHEET_ENDPOINT = "__SHEET_ENDPOINT__";
window.SHEET_FORM_ID = "__SHEET_FORM_ID__";
