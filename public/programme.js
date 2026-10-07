// The programme. Single source of truth for what gets prescribed — edit THIS
// file to change sets, reps, days or blocks; nothing in the page hard-codes them.
// Programme of 3 Oct 2026 (replaces the Aug 2026 hypertrophy programme).
//
// A day is up to three BLOCKS. A block is one exercise (straight sets) or two
// (a superset: alternate the two set by set). A superset never needs a plate
// swap — the `kit` tag says which bar or dumbbell each lift lives on. Reloading
// BETWEEN blocks is fine.
//
// Exercise names are the names sets are logged under, so they match the
// library and the Trainerize history where the lift is the same lift:
//   "DB rear-delt raise" -> Rear Delt Flye     "Barbell curl" -> Barbell Bicep Curl
//   "One-arm DB row"     -> Single-Arm DB Row  "Band pulldown" -> Banded Lat Pulldown
//   "DB hammer curl"     -> Hammer Curl        "Squat" -> Barbell Back Squat
//   "Deadlift"           -> Barbell Deadlift
//
// Loaded as a plain script by the page, and by the tests under node.
(function (root) {

  // ------------------------------------------------------------ FORM CUES
  // Short, shown on the cards of the lifts that list them.
  var CUES = {
    rotate:  "End the set when the right arm starts to rotate inwards — even with reps left. " +
             "Rest-pause is fine: 10–15 s, then a few more clean reps.",
    lateral: "Thumbs level or slightly up · arms ~30° forward · stop at shoulder height.",
    lockout: "Stop just short of full elbow lockout."
  };

  // ------------------------------------------------------------ THE LIFTS
  // rest  = seconds after a straight set (supersets use SUPERSET_REST)
  // step  = kg per +/- tap        band = load is a band level, not kg
  // side  = logged per arm        cues = keys into CUES
  // direct / indirect = muscles credited 1 / 0.5 per set in the weekly tally
  var EXERCISES = {
    "Close-Grip Floor Press":         { rest: 90,  step: 2.5, cues: ["rotate", "lockout"], direct: ["Chest"],      indirect: ["Triceps"] },
    "DB Curl":                        { rest: 60,  step: 1,                                 direct: ["Biceps"] },
    "One-Arm DB Lateral Raise":       { rest: 60,  step: 1, side: true, cues: ["rotate", "lateral"], direct: ["Side delts"] },
    "Skull Crusher":                  { rest: 75,  step: 2.5, cues: ["lockout"],            direct: ["Triceps"] },
    "Barbell Shrug":                  { rest: 75,  step: 2.5,                               direct: ["Traps"] },
    "Rear Delt Flye":                 { rest: 60,  step: 1,                                 direct: ["Rear delts"] },
    "Barbell Bicep Curl":             { rest: 75,  step: 2.5,                               direct: ["Biceps"] },
    "Single-Arm DB Row":              { rest: 90,  step: 2, side: true,                     direct: ["Back"], indirect: ["Biceps", "Traps"] },
    "Banded Lat Pulldown":            { rest: 75,  band: true,                              direct: ["Back"], indirect: ["Biceps"] },
    "Hammer Curl":                    { rest: 60,  step: 1,                                 direct: ["Biceps"] },
    "Neutral-Grip DB Overhead Press": { rest: 90,  step: 2, cues: ["rotate", "lockout"],    indirect: ["Triceps", "Side delts"] },
    "Barbell Back Squat":             { rest: 150, step: 2.5,                               direct: ["Legs"] },
    "Barbell Deadlift":               { rest: 180, step: 5,                                 direct: ["Legs"], indirect: ["Traps"] },
    // Alternatives — for when the kit isn't there (a hotel, say). Logged under
    // their own names, credited for what they actually work.
    "Close-Grip Push-Up":             { rest: 60,  step: 1, cues: ["rotate", "lockout"],    direct: ["Chest"], indirect: ["Triceps"] },
    "Diamond Push Up":                { rest: 60,  step: 1, cues: ["lockout"],              direct: ["Triceps"], indirect: ["Chest"] },
    "Bench Dip":                      { rest: 60,  step: 1, cues: ["lockout"],              direct: ["Triceps"] },
    "Band Overhead Triceps Extension":{ rest: 60,  band: true, cues: ["lockout"],           direct: ["Triceps"] },
    "Backpack Curl":                  { rest: 60,  step: 1,                                 direct: ["Biceps"] },
    "Band Curl":                      { rest: 60,  band: true,                              direct: ["Biceps"] },
    "Towel Isometric Curl":           { rest: 45,  step: 1, note: "Stand on a towel, pull up hard for the reps' worth of seconds — log seconds as reps.", direct: ["Biceps"] },
    "Backpack Shrug":                 { rest: 60,  step: 1,                                 direct: ["Traps"] },
    "Suitcase Shrug":                 { rest: 60,  step: 1, note: "A loaded bag in each hand.", direct: ["Traps"] },
    "Band Lateral Raise":             { rest: 60,  band: true, side: true, cues: ["rotate", "lateral"], direct: ["Side delts"] },
    "Water-Bottle Lateral Raise":     { rest: 60,  step: 0.5, side: true, cues: ["rotate", "lateral"], direct: ["Side delts"] },
    "Prone Y-T Raise":                { rest: 45,  step: 1, note: "Face down on the floor or bed edge, thumbs up.", direct: ["Rear delts"] },
    "Band Reverse Fly":               { rest: 45,  band: true,                              direct: ["Rear delts"] },
    "Inverted Table Row":             { rest: 75,  step: 1, note: "Under a sturdy table, heels on the floor. Check it holds you first.", direct: ["Back"], indirect: ["Biceps", "Traps"] },
    "Backpack Row":                   { rest: 75,  step: 1, side: true,                     direct: ["Back"], indirect: ["Biceps", "Traps"] },
    "Door-Anchor Band Row":           { rest: 75,  band: true,                              direct: ["Back"], indirect: ["Biceps", "Traps"] },
    "Pike Push-Up":                   { rest: 75,  step: 1, cues: ["rotate", "lockout"],    indirect: ["Triceps", "Side delts"] },
    "Backpack Overhead Press":        { rest: 75,  step: 1, cues: ["rotate", "lockout"],    indirect: ["Triceps", "Side delts"] },
    "Bulgarian Split Squat":          { rest: 90,  step: 1, side: true,                     direct: ["Legs"] },
    "Backpack Goblet Squat":          { rest: 90,  step: 1,                                 direct: ["Legs"] },
    "Single-Leg RDL":                 { rest: 75,  step: 1, side: true,                     direct: ["Legs"] },
    // Warm-up only. No volume credit: two light sets are not working sets.
    "Band Pull-Apart":                { rest: 30,  band: true, note: "Palms up." },
    "Side-Lying DB External Rotation":{ rest: 30,  step: 1, side: true }
  };

  // Seconds between the two halves of a superset. Each lift still gets roughly
  // double this before its next set, because the other lift sits in between.
  var SUPERSET_REST = 45;

  // ------------------------------------------------------------ THE WEEK
  // Each block is a list of {ex, sets, reps, kit?}. Sat/Sun have no planned
  // work: they are for the pool and, once it is empty, bonus work.
  function ss(a, b) { return [a, b]; }
  function one(a) { return [a]; }
  function x(ex, sets, reps, kit) { return { ex: ex, sets: sets, reps: reps, kit: kit || null }; }

  var DAYS = {
    mon: {
      label: "Mon · arms, delts, traps", minutes: 60,
      blocks: [
        ss(x("Close-Grip Floor Press", 4, "8-12", "BB-A"),   x("DB Curl", 3, "10-15", "DB")),
        ss(x("One-Arm DB Lateral Raise", 3, "12-20", "DB"),  x("Skull Crusher", 4, "8-12", "BB-B")),
        ss(x("Barbell Shrug", 4, "10-15", "bar in rack"),    x("Rear Delt Flye", 3, "12-20", "DB"))
      ]
    },
    tue: {
      label: "Tue · arms, traps, delts", minutes: 30,
      blocks: [
        ss(x("Barbell Bicep Curl", 3, "8-12", "BB-A"),       x("Skull Crusher", 3, "8-12", "BB-B")),
        ss(x("Barbell Shrug", 3, "10-15", "bar in rack"),    x("One-Arm DB Lateral Raise", 3, "12-20", "DB"))
      ]
    },
    wed: {
      label: "Wed · leg day", minutes: 30,
      // If a PT session with Sophie happens, it is logged instead (the "PT with
      // Sophie" choice) and these sets do not go to the pool.
      ptAlternative: true,
      blocks: [
        one(x("Barbell Back Squat", 3, "6-10", "BB-A")),
        one(x("Barbell Deadlift", 3, "5-8", "BB-A"))
      ]
    },
    thu: {
      label: "Thu · back, delts, arms", minutes: 30,
      blocks: [
        ss(x("Single-Arm DB Row", 3, "8-12", "heavy DB"),    x("One-Arm DB Lateral Raise", 3, "12-20", "light DB")),
        ss(x("Banded Lat Pulldown", 3, "10-15", "band"),     x("Hammer Curl", 3, "8-12", "DB"))
      ]
    },
    fri: {
      label: "Fri · press, arms, traps", minutes: 60,
      blocks: [
        ss(x("Neutral-Grip DB Overhead Press", 3, "8-12", "DBs"), x("Barbell Bicep Curl", 3, "8-12", "BB-A")),
        ss(x("Barbell Shrug", 4, "10-15", "bar in rack"),    x("Rear Delt Flye", 3, "12-20", "DB")),
        ss(x("Close-Grip Floor Press", 4, "8-12", "BB-A"),   x("Skull Crusher", 4, "8-12", "BB-B"))
      ]
    }
  };

  // Optional, outside the three-block cap. Pick one, two light sets.
  var WARMUP = {
    label: "Warm-up (optional)",
    choices: [
      x("Band Pull-Apart", 2, "15-20", "band"),
      x("Side-Lying DB External Rotation", 2, "12-15", "light DB")
    ]
  };

  // ------------------------------------------------------------ ALTERNATIVES
  // Swaps offered on a pool card ("Alternatives") when the kit isn't there.
  // A set of the swap pays off one set of the original in the pool, and earns
  // the swap's own muscle credit in the tally. reps: only where the swap needs
  // a different range from the original; otherwise the original's applies.
  var ALTERNATIVES = {
    "Close-Grip Floor Press":   [x("Close-Grip Push-Up", 0, "8-20", "floor"), x("Diamond Push Up", 0, "6-15", "floor")],
    "Skull Crusher":            [x("Bench Dip", 0, "10-20", "chair or bed"), x("Diamond Push Up", 0, "6-15", "floor"), x("Band Overhead Triceps Extension", 0, null, "band")],
    "DB Curl":                  [x("Backpack Curl", 0, null, "loaded backpack"), x("Band Curl", 0, null, "band"), x("Towel Isometric Curl", 0, "10-20", "towel")],
    "Barbell Bicep Curl":       [x("Backpack Curl", 0, null, "loaded backpack"), x("Band Curl", 0, null, "band"), x("Towel Isometric Curl", 0, "10-20", "towel")],
    "Hammer Curl":              [x("Backpack Curl", 0, null, "loaded backpack"), x("Band Curl", 0, null, "band")],
    "Barbell Shrug":            [x("Backpack Shrug", 0, "15-25", "loaded backpack"), x("Suitcase Shrug", 0, "15-25", "two bags")],
    "One-Arm DB Lateral Raise": [x("Water-Bottle Lateral Raise", 0, "15-25", "water bottle"), x("Band Lateral Raise", 0, null, "band")],
    "Rear Delt Flye":           [x("Prone Y-T Raise", 0, "10-20", "floor"), x("Band Reverse Fly", 0, null, "band")],
    "Single-Arm DB Row":        [x("Inverted Table Row", 0, "8-15", "sturdy table"), x("Backpack Row", 0, null, "loaded backpack"), x("Door-Anchor Band Row", 0, null, "band + door")],
    "Banded Lat Pulldown":      [x("Inverted Table Row", 0, "8-15", "sturdy table"), x("Door-Anchor Band Row", 0, null, "band + door")],
    "Neutral-Grip DB Overhead Press": [x("Pike Push-Up", 0, "6-12", "floor"), x("Backpack Overhead Press", 0, null, "loaded backpack")],
    "Barbell Back Squat":       [x("Bulgarian Split Squat", 0, "8-15", "chair or bed"), x("Backpack Goblet Squat", 0, "12-20", "loaded backpack")],
    "Barbell Deadlift":         [x("Single-Leg RDL", 0, "8-15", "backpack optional")]
  };

  // ------------------------------------------------------------ BONUS
  // Extra work on a good day. Offered ONLY once the pool is empty. Aimed at the
  // muscles the plan leaves at the bottom of their range: chest, rear delts, back.
  var BONUS = {
    x1: { id: "x1", label: "Chest + rear delts", blocks: [
      ss(x("Close-Grip Floor Press", 3, "8-12", "BB-A"), x("Rear Delt Flye", 3, "12-20", "DB"))
    ]},
    x2: { id: "x2", label: "Back", blocks: [
      ss(x("Single-Arm DB Row", 3, "8-12", "heavy DB"), x("Banded Lat Pulldown", 3, "10-15", "band"))
    ]},
    x3: { id: "x3", label: "Side + rear delts", blocks: [
      ss(x("One-Arm DB Lateral Raise", 3, "12-20", "light DB"), x("Rear Delt Flye", 3, "12-20", "DB"))
    ]}
  };

  // ------------------------------------------------------------ WEEKLY TALLY
  // Sets per muscle per week (Mon–Sun). Direct = 1, indirect = 0.5.
  // min/max null = no target, just counted.
  var TARGETS = [
    { muscle: "Biceps",     min: 14, max: 16 },
    { muscle: "Triceps",    min: 14, max: 16 },
    { muscle: "Traps",      min: 14, max: 16 },
    { muscle: "Chest",      min: 10, max: 10, approx: true },
    { muscle: "Side delts", min: 10, max: 10, approx: true },
    { muscle: "Rear delts", min: 6,  max: 8 },
    { muscle: "Back",       min: 6,  max: 8 },
    { muscle: "Legs",       min: null, max: null }
  ];

  // Lifts logged outside the programme (a PT session, an old bonus) still count,
  // by their library muscle group, as direct sets. "Shoulders" is left out — it
  // cannot say side delt from rear delt.
  var LIBRARY_MUSCLE = { Chest: "Chest", Back: "Back", Biceps: "Biceps", Triceps: "Triceps", Legs: "Legs", Traps: "Traps" };

  root.PROGRAMME = {
    version: "2026-10-03",
    timezone: "Europe/London",          // the pool's day ends and week reset run on this clock
    effort: "Every working set at 1–3 reps in reserve.",
    progression: "Add reps within the range first, then add load.",
    cues: CUES,
    exercises: EXERCISES,
    supersetRest: SUPERSET_REST,
    days: DAYS,
    warmup: WARMUP,
    alternatives: ALTERNATIVES,
    bonus: BONUS,
    targets: TARGETS,
    libraryMuscle: LIBRARY_MUSCLE,
    ptLabel: "PT with Sophie"
  };

  root.DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  // After a bonus session only.
  root.BONUS_TOPUP = {
    prompt: "Grab a protein bar",
    detail: "~200 kcal / ~20 g protein. Not a yfood — those are 500 kcal, five times what the session cost.",
    kcal: 200,
    protein: 20
  };
})(typeof window !== "undefined" ? window : globalThis);
