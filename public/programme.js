// The weekly skeleton. Single source of truth for what gets prescribed.
// Solo days are capped at THREE exercises — Karl's ruling, 30 Aug 2026:
// more than three and adherence drops, and an unskipped session beats a longer one.
window.PROGRAMME = {
  mon: {
    label: "Chest + Triceps",
    kind: "solo",
    exercises: [
      { name: "Flat DB Bench Press",   sets: 4, reps: "8-12",  rest: 90, step: 2 },
      { name: "Incline DB Flye",       sets: 3, reps: "10-15", rest: 75, step: 1 },
      { name: "Skull Crusher",         sets: 4, reps: "10-12", rest: 75, step: 2.5 }
    ]
  },
  tue: { label: "PT with Sophie — Heavy Push/Pull", kind: "pt" },
  wed: {
    label: "Back + Biceps",
    kind: "solo",
    exercises: [
      { name: "Single-Arm DB Row",     sets: 4, reps: "8-12",  rest: 90, step: 2, perSide: true },
      { name: "Banded Lat Pulldown",   sets: 3, reps: "10-15", rest: 75, band: true },
      { name: "DB Curl",               sets: 4, reps: "8-12",  rest: 75, step: 1 }
    ]
  },
  thu: {
    label: "Shoulders + Arms",
    kind: "solo",
    exercises: [
      { name: "Seated DB Overhead Press", sets: 3, reps: "8-12",  rest: 90, step: 2 },
      { name: "DB Lateral Raise",         sets: 4, reps: "12-15", rest: 60, step: 1 },
      { name: "Hammer Curl",              sets: 4, reps: "10-12", rest: 60, step: 1 }
    ]
  },
  fri: { label: "PT with Sophie — Heavy Pull/Legs", kind: "pt" },
  sat: {
    label: "Shoulders + Arms (2nd touch)",
    kind: "solo",
    exercises: [
      { name: "Leaning DB Lateral Raise",   sets: 4, reps: "12-15", rest: 60, step: 1 },
      { name: "Band Face Pull",             sets: 3, reps: "15-20", rest: 60, band: true },
      { name: "Overhead DB Triceps Ext",    sets: 4, reps: "10-12", rest: 60, step: 2 }
    ]
  },
  sun: { label: "Rest — or a flex session if you fancy it", kind: "flex" }
};
window.DAY_KEYS = ["sun","mon","tue","wed","thu","fri","sat"];
