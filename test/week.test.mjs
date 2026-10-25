// node --test   (npm test)
// The pool and the tally, against the real programme.js.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../public/programme.js");
const W = require("../public/week.js");
const P = globalThis.PROGRAMME;

// Week of Mon 26 Oct – Sun 1 Nov 2026: the first week of programme v3.
const D = { mon: "2026-10-26", tue: "2026-10-27", wed: "2026-10-28", thu: "2026-10-29", fri: "2026-10-30", sat: "2026-10-31", sun: "2026-11-01" };

// Every planned set of a day, logged.
function dayRows(day) {
  return W.plannedFor(P.days[day]).map(p => ({ day, date: D[day], exercise: p.exercise, sets: p.sets }));
}
const fullWeek = () => ["mon", "tue", "wed", "thu", "fri"].flatMap(dayRows);

test("the plan as written lands where v3 says (counted 25 Oct 2026)", () => {
  const t = Object.fromEntries(W.tally(P, fullWeek(), []).map(r => [r.muscle, r.sets]));
  assert.deepEqual(t, {
    Biceps: 30, Triceps: 24.5, Traps: 22, Chest: 14,
    "Side delts": 20.5, "Rear delts": 17, Back: 18, Legs: 6
  });
});

test("the full plan lands inside every weekly target", () => {
  const t = Object.fromEntries(W.tally(P, fullWeek(), []).map(r => [r.muscle, r.sets]));
  for (const g of P.targets) assert.ok(t[g.muscle] >= g.min && t[g.muscle] <= g.max, `${g.muscle} ${t[g.muscle]}`);
});

test("five blocks on Mon/Fri, three Tue–Thu, and no superset more than two lifts", () => {
  const cap = { mon: 5, tue: 3, wed: 3, thu: 3, fri: 5 };
  for (const [k, d] of Object.entries(P.days)) {
    assert.ok(d.blocks.length <= cap[k], k);
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
  assert.equal(p.total, 38 + 18);
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

test("days before the programme started are not graded against it", () => {
  // Sun 25 Oct, the day before v3 began: nothing that week was planned by v3.
  assert.equal(W.computePool(P, [], "2026-10-25").total, 0);
});

test("the light partner of a heavy lift carries the long rest", () => {
  const b = W.expand(P, P.days.mon.blocks).blocks[0].exercises;
  assert.deepEqual(b.map(e => [e.name, e.rest]), [["Barbell Back Squat", 45], ["Rear Delt Flye", 120]]);
  const plain = W.expand(P, P.days.tue.blocks).blocks[0].exercises;
  assert.deepEqual(plain.map(e => e.rest), [45, 45]);
});

test("the pool clears when the week rolls over", () => {
  // Nothing at all logged last week; next Monday the pool is empty.
  assert.equal(W.computePool(P, [], D.sun).total, 38 + 18 + 18 + 18 + 39);
  assert.equal(W.computePool(P, [], "2026-11-02").total, 0);
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

test("warm-up sets earn no volume; old PT lifts count by their library muscle", () => {
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

test("the catch-up pool lists lifts for the muscles furthest from target first", () => {
  // Wednesday onwards with nothing logged: Mon + Tue in the pool, tally all zero.
  const pool = W.computePool(P, [], D.wed);
  const ranked = W.rankPool(P, pool.exercises, [], []).map(x => x.exercise);
  // Scores (top of range): Row 18 + ½·30 + ½·24 = 45 · Pulldown 18 + ½·30 = 33 ·
  // DB Curl 30 · Barbell Curl 30 · Floor Press 14 + ½·26 = 27 · Skull 26 · Shrug 24 ·
  // Lateral 22 · Rear Delt 18 · Squat 6. Legs, held at maintenance, come last.
  assert.deepEqual(ranked, ["Single-Arm DB Row", "Banded Lat Pulldown", "DB Curl", "Barbell Bicep Curl",
                            "Close-Grip Floor Press", "Skull Crusher", "Barbell Shrug",
                            "One-Arm DB Lateral Raise", "Rear Delt Flye", "Barbell Back Squat"]);
});

test("a muscle already at the top of its range scores nothing", () => {
  const rows = [{ day: "mon", date: D.mon, exercise: "Rear Delt Flye", sets: 18 }];
  const ex = [{ exercise: "Rear Delt Flye" }, { exercise: "DB Curl" }];
  assert.deepEqual(W.rankPool(P, ex, rows, []).map(x => x.exercise), ["DB Curl", "Rear Delt Flye"]);
  const full = [{ day: "mon", date: D.mon, exercise: "DB Curl", sets: 30 }, ...rows];
  // Both zero: the pool's own order stands.
  assert.deepEqual(W.rankPool(P, ex, full, []).map(x => x.exercise), ["Rear Delt Flye", "DB Curl"]);
});

test("a swap logged for a pooled lift pays it off, and earns its own muscle credit", () => {
  const rows = [...dayRows("mon").filter(r => r.exercise !== "Close-Grip Floor Press"),
                { day: "pool:Close-Grip Floor Press", date: D.tue, exercise: "Close-Grip Push-Up", sets: 3 }];
  const p = W.computePool(P, rows, D.tue);
  assert.deepEqual(p.items.map(i => [i.exercise, i.remaining]), [["Close-Grip Floor Press", 1]]);
  const t = Object.fromEntries(W.tally(P, rows.filter(r => r.day.startsWith("pool")), []).map(r => [r.muscle, r.sets]));
  assert.equal(t.Chest, 3);
  assert.equal(t.Triceps, 1.5);
});

test("every alternative is described, so it earns credit and gets its cues", () => {
  for (const [orig, alts] of Object.entries(P.alternatives)) {
    assert.ok(P.exercises[orig], orig);
    for (const a of alts) {
      const e = P.exercises[a.ex];
      assert.ok(e, a.ex);
      assert.ok((e.direct || []).length + (e.indirect || []).length > 0, a.ex);
    }
  }
});

test("a swap done on its planned day counts as that day's set, so nothing pools", () => {
  const rows = [...dayRows("mon").filter(r => r.exercise !== "Barbell Shrug"),
                { day: "mon:Barbell Shrug", date: D.mon, exercise: "Backpack Shrug", sets: 4 }];
  assert.equal(W.computePool(P, rows, D.tue).total, 0);
  const t = Object.fromEntries(W.tally(P, rows, []).map(r => [r.muscle, r.sets]));
  // 4 from the backpack shrugs + ½ × 4 from Monday's single-arm rows.
  assert.equal(t.Traps, 6);
});

test("every lift on every day has an alternative", () => {
  for (const [k, d] of Object.entries(P.days)) for (const b of d.blocks) for (const s of b)
    assert.ok((P.alternatives[s.ex] || []).length, `${k}: ${s.ex}`);
});
