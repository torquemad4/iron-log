// The programme. Single source of truth for what gets prescribed — edit THIS
// file to change sets, reps, days or blocks; nothing in the page hard-codes them.
// Programme v3.1 — THE MODERATE CUT — 26 Oct 2026 → the next Quarterly
// (~Jan 2027), then re-evaluated. v3 as first agreed 25 Oct 2026, revised the
// same day after a PT-eye review (Karl: "let's give that a go"):
//   - Goal is to look shredded: a moderate cut (~0.5% bodyweight/week) run as
//     a recomposition, so volume is trimmed for a deficit and loads stay heavy.
//   - Mon/Fri 4 blocks (~70 min), Tue–Thu 3 (~35–40). Laterals and skull
//     crushers on 3 days (shoulder, elbows); cable pushdown as the second
//     triceps lift; lats lead the back work; direct abs; one low-incline press
//     trial; legs at 6–8 reps (squat Mon, Romanian deadlift Fri), done last.
//   - Weeks 1–2 at 3 reps in reserve; Christmas week is a deload (PHASES).
//   - Cable lifts need a pulley not yet bought: KIT.pulley = false prescribes
//     band/floor stand-ins until it is flipped.
// Original v3 terms (25 Oct 2026), still standing where not revised above:
//   - No PT. Sophie is out; it is Karl and Claude.
//   - Mon + Fri ~1.5 h (five blocks) — revised to ~70 min / four blocks for the cut.
//   - Weekend: ONE catch-up day (whichever of Sat/Sun suits), the other rest.
//   - Maximum practical hypertrophy volume on the upper body; legs get heavy
//     strength sets (squat Mon, deadlift Fri) to maintain, nothing more.
//   - Full volume from day one — no ramp (Karl's call). The right-shoulder
//     cue still ends any pressing or lateral set at the turn-in.
//
// A day is a list of BLOCKS. A block is one exercise (straight sets) or two
// (a superset: alternate the two set by set). A superset never needs a plate
// swap — the `kit` tag says which bar or dumbbell each lift lives on, and a
// superset pairs at most one two-dumbbell lift with a barbell or band, or two
// one-arm dumbbell lifts on differently loaded handles. Reloading BETWEEN
// blocks is fine. The block cap is 5 on Mon/Fri and 3 Tue–Thu (was 3 every
// day; lifted for the long days by Karl, 25 Oct 2026). v3.1 uses 4 on Mon/Fri.
// The cable counts as its own weight: a cable lift pairs with anything.
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
    lockout: "Stop just short of full elbow lockout.",
    stretch: "Stop a hand's width above the chest — no chasing the stretch. Drop it if the shoulder complains.",
    warmup:  "Ramp up first: bar × 8, then ~50% × 5 and ~75% × 3, then the working sets."
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
    "Barbell Back Squat":             { rest: 150, step: 2.5, cues: ["warmup"],             direct: ["Legs"] },
    "Barbell Romanian Deadlift":      { rest: 150, step: 2.5, cues: ["warmup"], note: "Hinge, soft knees, bar down the thighs to just below the knee.", direct: ["Legs"] },
    // v3.1. Cable lifts run off the pulley (KIT.pulley); the band and floor
    // stand-ins are what is prescribed until it is up.
    "Cable Pulldown":                 { rest: 75,  step: 2.5,                               direct: ["Back"], indirect: ["Biceps"] },
    "Cable Pushdown":                 { rest: 60,  step: 2.5, cues: ["lockout"],            direct: ["Triceps"] },
    "Cable Face Pull":                { rest: 60,  step: 2.5, note: "Rope to the forehead, elbows high, thumbs back.", direct: ["Rear delts"] },
    "Band Pushdown":                  { rest: 60,  band: true, cues: ["lockout"], note: "Band anchored high, as for the pulldown.", direct: ["Triceps"] },
    "Low-Incline Neutral DB Press":   { rest: 90,  step: 2, cues: ["rotate", "stretch", "lockout"], direct: ["Chest"], indirect: ["Triceps"] },
    "Weighted Crunch":                { rest: 45,  step: 2.5, note: "Plate held on the chest; curl the ribs to the hips.", direct: ["Abs"] },
    "Lying Leg Raise":                { rest: 45,  step: 1, note: "Lower back pressed into the floor — bend the knees if it lifts. Log extra load in kg, else 0.", direct: ["Abs"] },
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
  // A lift can override it (`rest` in x() below): the light partner of a heavy
  // squat or deadlift carries the long rest, so the barbell lift gets ~3 min.
  var SUPERSET_REST = 45;

  // ------------------------------------------------------------ THE WEEK
  // Each block is a list of {ex, sets, reps, kit?, rest?}. Sat/Sun have no
  // planned work: one of them is the catch-up day (the pool), the other rest.
  function ss(a, b) { return [a, b]; }
  function x(ex, sets, reps, kit, opt) {
    var o = { ex: ex, sets: sets, reps: reps, kit: kit || null };
    if (opt && opt.rest != null) o.rest = opt.rest;
    return o;
  }

  // ------------------------------------------------------------ KIT
  // Flip pulley to true once the pulley is mounted, and deploy. Until then the
  // band/floor stand-ins are prescribed, logged under their own names.
  var KIT = { pulley: false };
  function pulley(withIt, without) { return KIT.pulley ? withIt : without; }
  var PULLDOWN = pulley("Cable Pulldown", "Banded Lat Pulldown");
  var PUSHDOWN = pulley("Cable Pushdown", "Band Pushdown");
  var FACEPULL = pulley("Cable Face Pull", "Prone Y-T Raise");
  var CABLE = pulley("cable", "band");

  var DAYS = {
    mon: {
      label: "Mon · chest, arms, lats, delts, traps, squat", minutes: 70,
      blocks: [
        ss(x("Close-Grip Floor Press", 4, "8-12", "BB-A"),    x("DB Curl", 3, "10-15", "DB")),
        ss(x(PULLDOWN, 4, "8-12", CABLE),                     x("One-Arm DB Lateral Raise", 4, "12-20", "DB")),
        ss(x("Skull Crusher", 3, "8-12", "BB-B"),             x("Barbell Shrug", 3, "10-15", "bar in rack")),
        // Legs last, so a short session loses legs rather than arms. The
        // crunch fills the squat's rest and carries the long gap.
        ss(x("Barbell Back Squat", 3, "6-8", "BB-A in rack"), x("Weighted Crunch", 3, "10-15", "plate", { rest: 120 }))
      ]
    },
    tue: {
      label: "Tue · arms, back, rear delts, traps, abs", minutes: 40,
      blocks: [
        ss(x("Barbell Bicep Curl", 3, "8-12", "BB-A"),        x(PUSHDOWN, 3, "10-15", CABLE)),
        ss(x("Single-Arm DB Row", 3, "8-12", "heavy DB"),     x(FACEPULL, 3, "12-20", KIT.pulley ? "cable" : "floor")),
        ss(x("Barbell Shrug", 3, "10-15", "bar in rack"),     x("Lying Leg Raise", 3, "10-15", "floor"))
      ]
    },
    wed: {
      label: "Wed · lats, arms, chest, traps, delts", minutes: 40,
      blocks: [
        ss(x(PULLDOWN, 3, "10-12", CABLE),                    x("Hammer Curl", 3, "8-12", "DB")),
        // The incline is a trial: if the shoulder objects, swap it for the
        // floor press (Alternatives) and tell Claude to take it out.
        ss(x("Low-Incline Neutral DB Press", 3, "8-12", "DBs"), x("Skull Crusher", 3, "8-12", "BB-B")),
        ss(x("Barbell Shrug", 3, "10-15", "bar in rack"),     x("One-Arm DB Lateral Raise", 4, "12-20", "DB"))
      ]
    },
    thu: {
      label: "Thu · press, arms, chest, rear delts, abs", minutes: 40,
      blocks: [
        ss(x("Neutral-Grip DB Overhead Press", 3, "8-12", "DBs"), x("Barbell Bicep Curl", 3, "8-12", "BB-A")),
        ss(x("Close-Grip Floor Press", 3, "8-12", "BB-B"),    x("Rear Delt Flye", 3, "12-20", "DB")),
        ss(x(PUSHDOWN, 3, "10-15", CABLE),                    x("Weighted Crunch", 3, "10-15", "plate"))
      ]
    },
    fri: {
      label: "Fri · lats, delts, back, arms, traps, RDL", minutes: 70,
      blocks: [
        ss(x(PULLDOWN, 4, "8-12", CABLE),                     x("One-Arm DB Lateral Raise", 4, "12-20", "DB")),
        ss(x("Single-Arm DB Row", 4, "8-12", "heavy DB"),     x("Skull Crusher", 3, "8-12", "BB-B")),
        ss(x("Barbell Shrug", 3, "10-15", "bar in rack"),     x("Rear Delt Flye", 3, "12-20", "DB")),
        ss(x("Barbell Romanian Deadlift", 3, "6-8", "BB-A"),  x("Hammer Curl", 3, "8-12", "DB", { rest: 105 }))
      ]
    }
  };

  // Optional, outside the block cap. Pick one, two light sets.
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
    "Barbell Deadlift":         [x("Single-Leg RDL", 0, "8-15", "backpack optional")],
    "Barbell Romanian Deadlift": [x("Single-Leg RDL", 0, "8-15", "backpack optional")],
    "Cable Pulldown":           [x("Banded Lat Pulldown", 0, null, "band"), x("Inverted Table Row", 0, "8-15", "sturdy table"), x("Door-Anchor Band Row", 0, null, "band + door")],
    "Cable Pushdown":           [x("Band Pushdown", 0, null, "band"), x("Bench Dip", 0, "10-20", "chair or bed"), x("Diamond Push Up", 0, "6-15", "floor")],
    "Band Pushdown":            [x("Bench Dip", 0, "10-20", "chair or bed"), x("Diamond Push Up", 0, "6-15", "floor"), x("Band Overhead Triceps Extension", 0, null, "band")],
    "Cable Face Pull":          [x("Prone Y-T Raise", 0, "10-20", "floor"), x("Band Reverse Fly", 0, null, "band")],
    "Prone Y-T Raise":          [x("Band Reverse Fly", 0, null, "band"), x("Rear Delt Flye", 0, "12-20", "DB")],
    "Low-Incline Neutral DB Press": [x("Close-Grip Floor Press", 0, "8-12", "BB-A"), x("Close-Grip Push-Up", 0, "8-20", "floor")],
    "Weighted Crunch":          [x("Lying Leg Raise", 0, "10-15", "floor")],
    "Lying Leg Raise":          [x("Weighted Crunch", 0, "10-15", "plate or backpack")]
  };

  // ------------------------------------------------------------ PHASES
  // Calendar-driven, so nobody has to remember them. `setsFactor` scales every
  // prescribed set count that week (rounded up) — the pool counts the same.
  var PHASES = [
    { from: "2026-10-26", to: "2026-11-08", label: "Weeks 1–2",
      effort: "Weeks 1–2: every working set at 3 reps in reserve." },
    { from: "2026-12-21", to: "2026-12-27", label: "Deload week", setsFactor: 0.5,
      effort: "Deload week: half the sets, same loads, 3+ reps in reserve. Back to full volume after Christmas." }
  ];

  // ------------------------------------------------------------ BONUS
  // None in v3. The plan already sits at maximum practical volume, and the
  // weekend's second day is rest — a bonus menu would only invite junk volume
  // on it. The bonus machinery stays (a locked Planner bonus slot still works).
  var BONUS = {};

  // ------------------------------------------------------------ WEEKLY TALLY
  // Sets per muscle per week (Mon–Sun). Direct = 1, indirect = 0.5. The ranges
  // sit around where the full v3.1 plan lands (counted 25 Oct 2026): biceps
  // 24, triceps 21.5, back 18, traps 15.5, side delts 13.5, chest 10, rear
  // delts 9, abs 9, legs 6. Sized for a deficit — v3 (build) ran ~30% higher.
  var TARGETS = [
    { muscle: "Biceps",     min: 22, max: 26 },
    { muscle: "Triceps",    min: 20, max: 24 },
    { muscle: "Back",       min: 16, max: 20 },
    { muscle: "Traps",      min: 14, max: 18 },
    { muscle: "Side delts", min: 12, max: 16 },
    // Held low on purpose: chest pressing is where the right shoulder turns in.
    { muscle: "Chest",      min: 9,  max: 11, approx: true },
    { muscle: "Rear delts", min: 8,  max: 12 },
    { muscle: "Abs",        min: 8,  max: 10 },
    // Maintenance: squat 3 Mon + Romanian deadlift 3 Fri.
    { muscle: "Legs",       min: 6,  max: 6,  approx: true }
  ];

  // Lifts logged outside the programme (an old PT session or bonus) still count,
  // by their library muscle group, as direct sets. "Shoulders" is left out — it
  // cannot say side delt from rear delt.
  var LIBRARY_MUSCLE = { Chest: "Chest", Back: "Back", Biceps: "Biceps", Triceps: "Triceps", Legs: "Legs", Traps: "Traps", Core: "Abs" };

  root.PROGRAMME = {
    version: "2026-10-26-cut",
    // Days before this are not graded against this programme: the pool for the
    // week it started in only looks at days on or after it.
    startsOn: "2026-10-26",
    reviewAt: "the next Quarterly (~Jan 2027)",
    kit: KIT,
    phases: PHASES,
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
    libraryMuscle: LIBRARY_MUSCLE
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
