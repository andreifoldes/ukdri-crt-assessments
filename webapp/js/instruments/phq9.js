(function () {
  "use strict";
  const def = {
    id: "phq9",
    name: "Patient Health Questionnaire (PHQ-9)",
    instructions: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    responseSets: {
      freq: [
        { label: "Not at all", value: 0 },
        { label: "Several days", value: 1 },
        { label: "More than half the days", value: 2 },
        { label: "Nearly every day", value: 3 },
      ],
    },
    items: [
      { id: "phq9_1", text: "Little interest or pleasure in doing things", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_2", text: "Feeling down, depressed, or hopeless", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_3", text: "Trouble falling or staying asleep, or sleeping too much", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_4", text: "Feeling tired or having little energy", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_5", text: "Poor appetite or overeating", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_6", text: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_7", text: "Trouble concentrating on things, such as reading the newspaper or watching television", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_8", text: "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual", type: "choice", responseSet: "freq", subscale: "total" },
      { id: "phq9_9", text: "Thoughts that you would be better off dead or of hurting yourself in some way", type: "choice", responseSet: "freq", subscale: "total" },
    ],
    scoring: { rule: "sum", subscales: { total: { max: 27 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
