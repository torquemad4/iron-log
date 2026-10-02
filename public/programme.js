// The programme. Single source of truth for what gets prescribed.
// Mirrors the Notion page "💪 Hypertrophy Programme — Aug 2026" (locked 30 Aug 2026).
//
// step  = load increment in kg for the +/- buttons
// band  = resistance band, so the weight field is a nominal "level", not kg
// side  = logged per arm/side

// Tuesday and Friday have NO fixed session. They used to be fixed PT days
// with Sophie; that was dropped on 2 Oct 2026. Whatever happens on them now is
// whatever is locked for them in the Planner.
window.PROGRAMME = {

  // ---------------------------------------------------------------- CORE
  mon: {
    kind: "core",
    label: "Back + delts",
    notionDay: "Mon - Back+Delts",
    exercises: [
      { name: "Single-Arm DB Row",       sets: 3, reps: "8-12",  rest: 90, step: 2, side: true },
      { name: "Leaning DB Lateral Raise", sets: 3, reps: "12-15", rest: 60, step: 1 },
      { name: "Band Face Pull",           sets: 4, reps: "15-20", rest: 60, band: true }
    ]
  },

  wed: {
    kind: "core",
    label: "Back + delts",
    notionDay: "Wed - Back+Delts",
    exercises: [
      { name: "Banded Lat Pulldown", sets: 3, reps: "10-15", rest: 75, band: true },
      { name: "DB Lateral Raise",    sets: 3, reps: "12-15", rest: 60, step: 1 },
      { name: "DB Curl",             sets: 3, reps: "8-12",  rest: 75, step: 1 }
    ]
  },

  thu: {
    kind: "core",
    label: "Chest + rear delts + arms",
    notionDay: "Thu - Chest+Rear+Arms",
    exercises: [
      { name: "Incline DB Flye", sets: 3, reps: "10-15", rest: 75, step: 1 },
      { name: "Rear Delt Flye",  sets: 3, reps: "15-20", rest: 60, step: 1 },
      { name: "Hammer Curl",     sets: 3, reps: "10-12", rest: 60, step: 1 }
    ]
  },

  // The weekend session. Offered on BOTH Sat and Sun; whichever he does, it is
  // the same session and logs under the same notionDay.
  weekend: {
    kind: "core",
    label: "Back + delts + triceps",
    notionDay: "Sat - Back+Delts+Tri",
    floats: ["sat", "sun"],
    defaultDay: "sat",
    exercises: [
      { name: "Single-Arm DB Row",        sets: 3, reps: "8-12",  rest: 90, step: 2, side: true },
      { name: "Leaning DB Lateral Raise", sets: 3, reps: "12-15", rest: 60, step: 1 },
      { name: "Skull Crusher",            sets: 3, reps: "10-12", rest: 75, step: 2.5 }
    ]
  }
};

// ---------------------------------------------------------------- BONUS
// Optional. Never replaces a core session. Two exercises, ~18 min.
// Any of these can be done on any day, including a day that already had a core
// session. Doing ALL FIVE in a week still leaves every muscle inside the 10-20 band,
// so there is no combination the user can get wrong.
window.BONUS = {
  b1: {
    id: "b1", label: "Delts", notionDay: "Bonus - Delts",
    exercises: [
      { name: "DB Lateral Raise", sets: 3, reps: "12-15", rest: 60, step: 1 },
      { name: "Band Face Pull",   sets: 3, reps: "15-20", rest: 60, band: true }
    ]
  },
  b2: {
    id: "b2", label: "Back", notionDay: "Bonus - Back",
    exercises: [
      { name: "Single-Arm DB Row",           sets: 3, reps: "8-12",  rest: 75, step: 2, side: true },
      { name: "Banded Straight-Arm Pulldown", sets: 3, reps: "10-15", rest: 60, band: true }
    ]
  },
  b3: {
    id: "b3", label: "Chest", notionDay: "Bonus - Chest",
    exercises: [
      { name: "Incline DB Press", sets: 3, reps: "8-12",  rest: 75, step: 2 },
      { name: "Incline DB Flye",  sets: 3, reps: "10-15", rest: 60, step: 1 }
    ]
  },
  b4: {
    id: "b4", label: "Delts", notionDay: "Bonus - Delts",
    exercises: [
      { name: "Leaning DB Lateral Raise", sets: 3, reps: "12-15", rest: 60, step: 1 },
      { name: "Rear Delt Flye",           sets: 3, reps: "15-20", rest: 60, step: 1 }
    ]
  },
  b5: {
    id: "b5", label: "Arms", notionDay: "Bonus - Arms",
    exercises: [
      { name: "Hammer Curl",   sets: 3, reps: "10-12", rest: 60, step: 1 },
      { name: "Skull Crusher", sets: 3, reps: "10-12", rest: 75, step: 2.5 }
    ]
  }
};

window.DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Which programme entry applies to a weekday key.
window.sessionForDay = function (dayKey) {
  if (dayKey === "sat" || dayKey === "sun") return window.PROGRAMME.weekend;
  return window.PROGRAMME[dayKey] || null;
};

// After a bonus session only.
window.BONUS_TOPUP = {
  prompt: "Grab a protein bar",
  detail: "~200 kcal / ~20 g protein. Not a yfood — those are 500 kcal, five times what the session cost.",
  kcal: 200,
  protein: 20
};
