(function (global) {
  "use strict";

  function _choices(item, def) {
    const set = item.options || (def.responseSets && def.responseSets[item.responseSet]) || [];
    return set.map((o) => ({ value: o.value, text: o.label }));
  }

  function _itemToElements(item, def) {
    if (item.type === "static") {
      return [{ type: "html", name: item.id, html: "<h3>" + item.text + "</h3>" }];
    }
    if (item.type === "choice") {
      const els = [{
        type: "radiogroup", name: item.id, title: item.text,
        isRequired: true, choices: _choices(item, def),
      }];
      if (item.commentId) {
        els.push({
          type: "text", name: item.commentId,
          title: item.commentLabel || "Please describe", isRequired: false,
        });
      }
      return els;
    }
    if (item.type === "text") {
      if (item.format === "time") {
        return [{ type: "text", name: item.id, title: item.text, inputType: "time", isRequired: true }];
      }
      if (item.format === "number") {
        return [{
          type: "text", name: item.id, title: item.text, inputType: "number",
          isRequired: true, validators: [{ type: "numeric", minValue: 0 }],
        }];
      }
      return [{ type: "text", name: item.id, title: item.text, isRequired: true }];
    }
    throw new Error("Unknown item type: " + item.type);
  }

  function toSurveyJson(defsById, order, opts) {
    const options = opts || {};
    const pages = order.map((id) => {
      const def = defsById[id];
      const elements = [];
      for (const item of def.items) elements.push(..._itemToElements(item, def));
      return { name: def.id, title: def.name, description: def.instructions, elements };
    });
    return {
      showProgressBar: "top",
      progressBarType: "pages",
      showQuestionNumbers: "off",
      completedHtml: options.completedHtml || "<h2>Thank you.</h2>",
      pages,
    };
  }

  const API = { toSurveyJson };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else Object.assign(global, API);
})(typeof window !== "undefined" ? window : globalThis);
