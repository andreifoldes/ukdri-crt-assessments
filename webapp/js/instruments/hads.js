(function () {
  "use strict";
  const o = (label, value) => ({ label, value });
  const def = {
    id: "hads",
    name: "Hospital Anxiety and Depression Scale (HADS)",
    instructions: "Tick the box beside the reply that is closest to how you have been feeling in the past week. Do not take too long over your replies: your immediate reaction to each item will probably be more accurate than a long, thought-out response.",
    items: [
      // Left column (form order 1–7)
      { id: "hads_1", subscale: "anxiety", type: "choice", text: "I feel tense or 'wound up':",
        options: [o("Most of the time", 3), o("A lot of the time", 2), o("From time to time, occasionally", 1), o("Not at all", 0)] },
      { id: "hads_2", subscale: "depression", type: "choice", text: "I still enjoy the things I used to enjoy:",
        options: [o("Definitely as much", 0), o("Not quite so much", 1), o("Only a little", 2), o("Hardly at all", 3)] },
      { id: "hads_3", subscale: "anxiety", type: "choice", text: "I get a sort of frightened feeling as if something awful is about to happen:",
        options: [o("Very definitely and quite badly", 3), o("Yes, but not too badly", 2), o("A little, but it doesn't worry me", 1), o("Not at all", 0)] },
      { id: "hads_4", subscale: "depression", type: "choice", text: "I can laugh and see the funny side of things:",
        options: [o("As much as I always could", 0), o("Not quite so much now", 1), o("Definitely not so much now", 2), o("Not at all", 3)] },
      { id: "hads_5", subscale: "anxiety", type: "choice", text: "Worrying thoughts go through my mind:",
        options: [o("A great deal of the time", 3), o("A lot of the time", 2), o("From time to time, but not too often", 1), o("Only occasionally", 0)] },
      { id: "hads_6", subscale: "depression", type: "choice", text: "I feel cheerful:",
        options: [o("Not at all", 3), o("Not often", 2), o("Sometimes", 1), o("Most of the time", 0)] },
      { id: "hads_7", subscale: "anxiety", type: "choice", text: "I can sit at ease and feel relaxed:",
        options: [o("Definitely", 0), o("Usually", 1), o("Not often", 2), o("Not at all", 3)] },
      // Right column (form order 8–14)
      { id: "hads_8", subscale: "depression", type: "choice", text: "I feel as if I am slowed down:",
        options: [o("Nearly all the time", 3), o("Very often", 2), o("Sometimes", 1), o("Not at all", 0)] },
      { id: "hads_9", subscale: "anxiety", type: "choice", text: "I get a sort of frightened feeling like 'butterflies' in the stomach:",
        options: [o("Not at all", 0), o("Occasionally", 1), o("Quite often", 2), o("Very often", 3)] },
      { id: "hads_10", subscale: "depression", type: "choice", text: "I have lost interest in my appearance:",
        options: [o("Definitely", 3), o("I don't take as much care as I should", 2), o("I may not take quite as much care", 1), o("I take just as much care as ever", 0)] },
      { id: "hads_11", subscale: "anxiety", type: "choice", text: "I feel restless as I have to be on the move:",
        options: [o("Very much indeed", 3), o("Quite a lot", 2), o("Not very much", 1), o("Not at all", 0)] },
      { id: "hads_12", subscale: "depression", type: "choice", text: "I look forward with enjoyment to things:",
        options: [o("As much as I ever did", 0), o("Rather less than I used to", 1), o("Definitely less than I used to", 2), o("Hardly at all", 3)] },
      { id: "hads_13", subscale: "anxiety", type: "choice", text: "I get sudden feelings of panic:",
        options: [o("Very often indeed", 3), o("Quite often", 2), o("Not very often", 1), o("Not at all", 0)] },
      { id: "hads_14", subscale: "depression", type: "choice", text: "I can enjoy a good book or radio or TV program:",
        options: [o("Often", 0), o("Sometimes", 1), o("Not often", 2), o("Very seldom", 3)] },
    ],
    scoring: { rule: "hadsSubscales", subscales: { anxiety: { max: 21 }, depression: { max: 21 } } },
  };
  if (typeof registerInstrument === "function") registerInstrument(def);
  else (globalThis.__INSTRUMENT_QUEUE__ = globalThis.__INSTRUMENT_QUEUE__ || []).push(def);
})();
