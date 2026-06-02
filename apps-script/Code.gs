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
