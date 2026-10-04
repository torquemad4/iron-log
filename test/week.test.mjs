// node --test   (npm test)
// The pool and the tally, against the real programme.js.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../public/programme.js");
const W = require("../public/week.js");
const P = globalThis.PROGRAMME;

// Week of Mon 28 Sep – Sun 4 Oct 2026.
const D = { mon: "2026-09-28", tue: "2026-09-29", wed: "2026-09-30", thu: "2026-10-01", fri: "2026-10-02", sat: "2026-10-03", sun: "2026-10-04" };

// Every planned set of a day, logged.
function dayRows(day) {
  return W.plannedFor(P.days[day]).map(p => ({ day, date: D[day], exercise: p.exercise, sets: p.sets }));
}
const fullWeek = () => ["mon", "tue", "wed", "thu", "fri"].flatMap(dayRows);

test("the plan as written lands where the handover says", () => {
  const t = Object.fromEntries(W.tally(P, fullWeek(), []).map(r => [r.muscle, r.sets]));
  assert.deepEqual(t, {
    Biceps: 15, Triceps: 16.5, Traps: 14, Chest: 8,
    "Side delts": 10.5, "Rear delts": 6, Back: 6, Legs: 6
  });
});

test("no session has more than three blocks, and no superset more than two lifts", () => {
  for (const [k, d] of Object.entries(P.days)) {
    assert.ok(d.blocks.length <= 3, k);
    for (const b of d.blocks) assert.ok(b.length >= 1 && b.length <= 2, k);
    for (const b of d.blocks) for (const s of b) assert.ok(P.exercises[s.ex], `${k}: ${s.ex} has no entry in EXERCISES`);
  }
});

test("a day does not go to the pool until it is over", () => {
  const p = W.computePool(P, [], D.mon);
  assert.equal(p.total, 0);
});

test("everything missed Mon and Tue is in the pool on Wednesday", () => {
  const p = W.computePool(P, [], D.wed);
  assert.equal(p.total, 21 + 12);
  assert.deepEqual([...new Set(p.items.map(i => i.day))], ["mon", "tue"]);
});

test("a partly logged day only pools what was missed", () => {
  const rows = [...dayRows("mon").filter(r => r.exercise !== "Close-Grip Floor Press"),
                { day: "mon", date: D.mon, exercise: "Close-Grip Floor Press", sets: 2 }];
  const p = W.computePool(P, rows, D.tue);
  assert.deepEqual(p.items.map(i => [i.exercise, i.remaining]), [["Close-Grip Floor Press", 2]]);
});

test("pool work pays off the oldest missed sets first", () => {
  // Skull Crusher: Mon 4 + Tue 3 missed. Three pool sets clear Monday's first.
  const rows = [...dayRows("mon").filter(r => r.exercise !== "Skull Crusher"),
                ...dayRows("tue").filter(r => r.exercise !== "Skull Crusher"), ...dayRows("wed"),
                { day: "pool", date: D.wed, exercise: "Skull Crusher", sets: 3 }];
  const p = W.computePool(P, rows, D.thu);
  assert.deepEqual(p.items.map(i => [i.day, i.exercise, i.remaining]),
    [["mon", "Skull Crusher", 1], ["tue", "Skull Crusher", 3]]);
  assert.equal(p.exercises[0].remaining, 4);
});

test("a PT session keeps Wednesday's legs out of the pool", () => {
  const base = [...dayRows("mon"), ...dayRows("tue")];
  assert.equal(W.computePool(P, base, D.thu).total, 6);
  const pt = [...base, { day: "pt", date: D.wed, exercise: "Kettlebell Goblet Squat", sets: 4 }];
  assert.equal(W.computePool(P, pt, D.thu).total, 0);
});

test("the pool clears when the week rolls over", () => {
  // Nothing at all logged last week; next Monday the pool is empty.
  assert.equal(W.computePool(P, [], D.sun).total, 21 + 12 + 6 + 12 + 21);
  assert.equal(W.computePool(P, [], "2026-10-05").total, 0);
});

test("the week ends at Sunday 23:59 London time, not the phone's", () => {
  assert.equal(W.todayIn("Europe/London", new Date("2026-10-04T22:59:00Z")), "2026-10-04"); // 23:59 BST
  assert.equal(W.todayIn("Europe/London", new Date("2026-10-04T23:00:00Z")), "2026-10-05"); // 00:00 BST
  assert.equal(W.todayIn("Europe/London", new Date("2026-11-01T23:59:00Z")), "2026-11-01"); // 23:59 GMT
});

test("today's unsynced sets count once, not twice", () => {
  const server = [{ day: "pool", date: D.sat, exercise: "DB Curl", sets: 2 }];
  const local = [1, 2, 3].map(() => ({ day: "pool", date: D.sat, exercise: "DB Curl" }));
  assert.equal(W.mergeRows(server, local, D.sat)[0].sets, 3);
});

test("warm-up sets earn no volume, PT lifts count by their library muscle", () => {
  const rows = [{ day: "mon", date: D.mon, exercise: "Band Pull-Apart", sets: 2 },
                { day: "pt", date: D.wed, exercise: "Kettlebell Goblet Squat", sets: 4 }];
  const lib = [{ name: "Kettlebell Goblet Squat", muscle: "Legs" }];
  const t = Object.fromEntries(W.tally(P, rows, lib).map(r => [r.muscle, r.sets]));
  assert.equal(t["Rear delts"], 0);
  assert.equal(t.Legs, 4);
});

test("every lift that can land in the pool works at least one tallied muscle", () => {
  for (const d of Object.values(P.days)) for (const b of d.blocks) for (const s of b) {
    const e = P.exercises[s.ex];
    assert.ok((e.direct || []).length + (e.indirect || []).length > 0, s.ex);
  }
});
