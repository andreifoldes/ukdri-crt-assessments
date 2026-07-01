const test = require("node:test");
const assert = require("node:assert/strict");
const { toSurveyJson } = require("../js/survey-adapter.js");

const defsById = {
  demo: {
    id: "demo", name: "Demo Scale", instructions: "Answer please.",
    responseSets: { freq: [{ label: "No", value: 0 }, { label: "Yes", value: 1 }] },
    items: [
      { id: "c1", type: "choice", text: "A choice", responseSet: "freq" },
      { id: "hdr", type: "static", text: "Section header" },
      { id: "t1", type: "text", format: "time", text: "Bed time?" },
      { id: "n1", type: "text", format: "number", text: "Minutes?" },
      { id: "cj", type: "choice", text: "Other?", options: [{ label: "No", value: 0 }, { label: "Yes", value: 1 }], commentId: "cj_text", commentLabel: "Describe" },
    ],
    scoring: { rule: "sum" },
  },
  demo2: { id: "demo2", name: "Second", instructions: "x", items: [{ id: "z", type: "choice", text: "Q", options: [{ label: "A", value: 0 }] }], scoring: { rule: "sum" } },
};

test("toSurveyJson builds one page per instrument in the given order", () => {
  const json = toSurveyJson(defsById, ["demo2", "demo"], { completedHtml: "<p>done</p>" });
  assert.equal(json.pages.length, 2);
  assert.deepEqual(json.pages.map((p) => p.name), ["demo2", "demo"]);
  assert.equal(json.completedHtml, "<p>done</p>");
  assert.equal(json.showProgressBar, "top");
});

test("toSurveyJson maps item types correctly", () => {
  const page = toSurveyJson(defsById, ["demo"], {}).pages[0];
  const byName = Object.fromEntries(page.elements.map((e) => [e.name, e]));

  assert.equal(byName.c1.type, "radiogroup");
  assert.equal(byName.c1.isRequired, true);
  assert.deepEqual(byName.c1.choices, [{ value: 0, text: "No" }, { value: 1, text: "Yes" }]);

  assert.equal(byName.hdr.type, "html");
  assert.match(byName.hdr.html, /Section header/);

  assert.equal(byName.t1.type, "text");
  assert.equal(byName.t1.inputType, "time");
  assert.equal(byName.t1.isRequired, true);

  assert.equal(byName.n1.inputType, "number");
  assert.deepEqual(byName.n1.validators, [{ type: "numeric", minValue: 0 }]);

  // comment field emitted as its own non-required text question
  assert.equal(byName.cj.type, "radiogroup");
  assert.equal(byName.cj_text.type, "text");
  assert.equal(byName.cj_text.isRequired, false);
});
