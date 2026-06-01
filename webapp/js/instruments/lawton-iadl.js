(function () {
  "use strict";
  const o = (label, value) => ({ label, value });
  const def = {
    id: "lawton",
    name: "Lawton-Brody Instrumental Activities of Daily Living Scale (IADL)",
    instructions: "For each category below, choose the description that most closely resembles your own highest level of functioning.",
    items: [
      { id: "lawton_A", type: "choice", text: "A. Ability to use the telephone", options: [
        o("Operates telephone on own initiative — looks up and dials numbers, etc.", 1),
        o("Dials a few well-known numbers", 1),
        o("Answers telephone but does not dial", 1),
        o("Does not use telephone at all", 0)] },
      { id: "lawton_B", type: "choice", text: "B. Shopping", options: [
        o("Takes care of all shopping needs independently", 1),
        o("Shops independently for small purchases", 0),
        o("Needs to be accompanied on any shopping trip", 0),
        o("Completely unable to shop", 0)] },
      { id: "lawton_C", type: "choice", text: "C. Food preparation", options: [
        o("Plans, prepares and serves adequate meals independently", 1),
        o("Prepares adequate meals if supplied with ingredients", 0),
        o("Heats, serves and prepares meals, or prepares meals but does not maintain adequate diet", 0),
        o("Needs to have meals prepared and served", 0)] },
      { id: "lawton_D", type: "choice", text: "D. Housekeeping", options: [
        o("Maintains house alone or with occasional assistance (e.g. heavy-work domestic help)", 1),
        o("Performs light daily tasks such as dish washing, bed making", 1),
        o("Performs light daily tasks but cannot maintain acceptable level of cleanliness", 1),
        o("Needs help with all home maintenance tasks", 1),
        o("Does not participate in any housekeeping tasks", 0)] },
      { id: "lawton_E", type: "choice", text: "E. Laundry", options: [
        o("Does personal laundry completely", 1),
        o("Launders small items — rinses stockings, etc.", 1),
        o("All laundry must be done by others", 0)] },
      { id: "lawton_F", type: "choice", text: "F. Mode of transportation", options: [
        o("Travels independently on public transportation or drives own car", 1),
        o("Arranges own travel via taxi, but does not otherwise use public transportation", 1),
        o("Travels on public transportation when accompanied by another", 1),
        o("Travel limited to taxi or automobile with assistance of another", 0),
        o("Does not travel at all", 0)] },
      { id: "lawton_G", type: "choice", text: "G. Responsibility for own medications", options: [
        o("Is responsible for taking medication in correct dosages at correct time", 1),
        o("Takes responsibility if medication is prepared in advance in separate dosages", 0),
        o("Is not capable of dispensing own medication", 0)] },
      { id: "lawton_H", type: "choice", text: "H. Ability to handle finances", options: [
        o("Manages financial matters independently (budgets, writes cheques, pays rent/bills, goes to bank), collects and keeps track of income", 1),
        o("Manages day-to-day purchases, but needs help with banking, major purchases, etc.", 1),
        o("Incapable of handling money", 0)] },
    ],
    scoring: { rule: "lawtonSum", subscales: { total: { max: 8 } } },
    notes: "Scored across all 8 domains (0–8). Historical male 0–5 exclusion not applied.",
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
