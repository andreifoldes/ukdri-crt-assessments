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
