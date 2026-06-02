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
   - Who has access: **Anyone**  ← must be "Anyone", not "Anyone with Google account"
6. **Deploy**, authorise when prompted (for an unverified app: *Advanced ▸
   Go to … (unsafe) ▸ Allow*), and copy the **Web app URL** (ends in `/exec`).
7. In the GitHub repo: **Settings ▸ Secrets and variables ▸ Actions ▸
   New repository secret**, add:
   - `SHEET_ENDPOINT` = the `/exec` URL
   - `SHEET_FORM_ID` = `ukdri-crt-2026-x7q2`

## Re-deploying after edits

Apps Script keeps the same `/exec` URL only if you **Manage deployments ▸
edit the existing deployment ▸ new version**. Creating a *new* deployment
gives a new URL (update the `SHEET_ENDPOINT` secret if so).

## Notes
- The script self-extends columns by name, so the randomised instrument
  order never misaligns the sheet.
- `LockService` serialises appends so simultaneous submissions don't clobber.
- The endpoint is public by design (a static site can't hold a secret). The
  `formId` check drops casual/accidental junk; it is not real authentication.
