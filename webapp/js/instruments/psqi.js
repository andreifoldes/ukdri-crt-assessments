(function () {
  "use strict";
  const o = (label, value) => ({ label, value });
  const freq = [
    o("Not during the past month", 0),
    o("Less than once a week", 1),
    o("Once or twice a week", 2),
    o("Three or more times a week", 3),
  ];
  const disturbance = [
    ["q5a", "Cannot get to sleep within 30 minutes"],
    ["q5b", "Wake up in the middle of the night or early morning"],
    ["q5c", "Have to get up to use the bathroom"],
    ["q5d", "Cannot breathe comfortably"],
    ["q5e", "Cough or snore loudly"],
    ["q5f", "Feel too cold"],
    ["q5g", "Feel too hot"],
    ["q5h", "Had bad dreams"],
    ["q5i", "Have pain"],
  ].map(([id, text]) => ({ id, type: "choice", text, options: freq, group: "q5" }));

  const def = {
    id: "psqi",
    name: "Pittsburgh Sleep Quality Index (PSQI)",
    instructions: "The following questions relate to your usual sleep habits during the past month only. Your answers should indicate the most accurate reply for the majority of days and nights in the past month. Please answer all questions.",
    items: [
      { id: "q1_bedtime", type: "text", format: "time", text: "During the past month, what time have you usually gone to bed at night? (24-hour clock, e.g. 23:00 for 11 PM)" },
      { id: "q2_latency_min", type: "text", format: "number", text: "During the past month, how long (in minutes) has it usually taken you to fall asleep each night?" },
      { id: "q3_risetime", type: "text", format: "time", text: "During the past month, what time have you usually gotten up in the morning? (24-hour clock, e.g. 07:00 for 7 AM)" },
      { id: "q4_hours_sleep", type: "text", format: "number", text: "During the past month, how many hours of actual sleep did you get at night? (This may be different than the number of hours you spent in bed.)" },
      // q5_header is type "static" (display-only); the scorer and export skip type==="static" items.
      { id: "q5_header", type: "static", text: "During the past month, how often have you had trouble sleeping because you…" },
      ...disturbance,
      { id: "q5j", type: "choice", text: "Other reason(s), please describe — then rate how often you had trouble sleeping because of this:", options: freq, group: "q5", commentId: "q5j_text", commentLabel: "Other reason(s)" },
      { id: "q6_quality", type: "choice", text: "During the past month, how would you rate your sleep quality overall?",
        options: [o("Very good", 0), o("Fairly good", 1), o("Fairly bad", 2), o("Very bad", 3)] },
      { id: "q7_medication", type: "choice", text: "During the past month, how often have you taken medicine to help you sleep (prescribed or 'over the counter')?", options: freq },
      { id: "q8_stayawake", type: "choice", text: "During the past month, how often have you had trouble staying awake while driving, eating meals, or engaging in social activity?", options: freq },
      { id: "q9_enthusiasm", type: "choice", text: "During the past month, how much of a problem has it been for you to keep up enough enthusiasm to get things done?",
        options: [o("No problem at all", 0), o("Only a very slight problem", 1), o("Somewhat of a problem", 2), o("A very big problem", 3)] },
    ],
    scoring: { rule: "psqi", subscales: { global: { max: 21 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
