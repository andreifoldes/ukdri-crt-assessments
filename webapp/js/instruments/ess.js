(function () {
  "use strict";
  const dozing = [
    { label: "Would never doze", value: 0 },
    { label: "Slight chance of dozing", value: 1 },
    { label: "Moderate chance of dozing", value: 2 },
    { label: "High chance of dozing", value: 3 },
  ];
  const situations = [
    "Sitting and reading",
    "Watching TV",
    "Sitting, inactive in a public place (e.g. a theatre or a meeting)",
    "As a passenger in a car for an hour without a break",
    "Lying down to rest in the afternoon when circumstances permit",
    "Sitting and talking to someone",
    "Sitting quietly after a lunch without alcohol",
    "In a car, while stopped for a few minutes in the traffic",
  ];
  const def = {
    id: "ess",
    name: "Epworth Sleepiness Scale (ESS)",
    instructions: "How likely are you to doze off or fall asleep in the following situations, in contrast to feeling just tired? This refers to your usual way of life in recent times. Even if you have not done some of these things recently, try to work out how they would have affected you.",
    responseSets: { dozing },
    items: situations.map((text, i) => ({
      id: "ess_" + (i + 1), text, type: "choice", responseSet: "dozing", subscale: "total",
    })),
    scoring: { rule: "sum", subscales: { total: { max: 24 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
