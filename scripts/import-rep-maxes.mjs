#!/usr/bin/env node
// Turn a rep-max export into SQL for D1.
//
//   node scripts/import-rep-maxes.mjs trainerize-sets.csv > rep-maxes.sql
//   npx wrangler d1 execute ironlog --remote --file=rep-maxes.sql
//
// Trainerize itself cannot export workout history. The file this is built for
// is `trainerize export` from agentic-fitness-sync (one row per logged set:
// date, workout, exercise, muscle, equipment, set, reps, weightKg, rpe, …),
// and it also takes the hand-filled public/rep-maxes-template.csv.
//
// Columns are read by NAME, not position. If a file does not fit, it stops and
// prints the headers it found rather than guessing — extend ALIASES and rerun.
// Nothing is written by this script; it only prints SQL.
//
// Every set is reduced to ONE row per exercise × reps × date: the heaviest.
// That is what a rep max is, and it keeps a few thousand sets from becoming a
// few thousand rows. Sets with no load (bodyweight, bands logged as 0) are
// skipped — a rep max of nothing says nothing.
//
// Weights are assumed to be kg. A column or cell that says "lb"/"lbs" is
// converted. Output is INSERT OR IGNORE with a content-derived id, the same
// id /api/rep-maxes uses, so running an export twice is harmless.
//
// Exercise names are checked against the library in schema.sql and reported on
// stderr when they do not match, because "Dumbbell Row" and "Single-Arm DB Row"
// would otherwise become two lifts with two histories. Map them in RENAME.

import { readFileSync } from "node:fs";

const ALIASES = {
  exercise: ["exercise", "exercise name", "name", "movement", "lift"],
  reps:     ["reps", "rep", "rep max", "rm", "repetitions", "reps completed"],
  weight:   ["weight", "load", "weight (kg)", "weight kg", "kg", "weight (lbs)", "weightkg", "weight lbs", "lbs", "max", "max weight"],
  date:     ["date", "workout date", "completed", "completed date", "day", "performed"]
};

// Trainerize name -> Iron Log name. Only where they are demonstrably the same
// lift, judged against the loads logged in Iron Log (Sep 2026). A wrong merge
// splices two histories together; a missed one just leaves two entries, which
// an UPDATE on rep_maxes can join later. So when in doubt, it stays separate:
// "DB Skull Crusher" (6.5–14 kg) is NOT Iron Log's Skull Crusher (20 kg, which
// matches the barbell one), and the chest-supported / standing rear-delt
// variants and the FLAT chest fly are kept apart from the library lifts.
const RENAME = {
  "Dumbbell Single Arm Row":      "Single-Arm DB Row",
  "Dumbbell Lateral Raise":       "DB Lateral Raise",
  "Barbell Skullcrusher":         "Skull Crusher",
  "Rear Deltoid Fly":             "Rear Delt Flye",
  "Dumbbell Bicep Curl":          "DB Curl",
  "Dumbbell Incline Bench Press": "Incline DB Press",
  "Dumbbell Bench Press":         "Flat DB Bench Press",
};

// --library also adds every lift that has a rep max but is not yet in the
// exercise library, so the Planner can show its history and Sophie can pick it.
// They go in with plain defaults (weighted, 3 × 8-12, 75 s) and are marked
// added_by = 'trainerize-import'; the numbers that matter are set per slot.
const withLibrary = process.argv.includes("--library");
const file = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!file) { console.error("usage: node scripts/import-rep-maxes.mjs [--library] <export.csv>"); process.exit(1); }

const rows = parseCSV(readFileSync(file, "utf8").replace(/^﻿/, ""));
if (rows.length < 2) die("no data rows found");

const head = rows[0].map(h => h.trim().toLowerCase());
const col = {};
for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex(h => names.includes(h));
const missing = Object.keys(col).filter(k => col[k] < 0);
if (missing.length) die(`could not find column(s): ${missing.join(", ")}\nheaders in the file: ${rows[0].join(" | ")}`);
const headerSaysLb = /lb/.test(head[col.weight]);

const library = new Set(
  [...readFileSync(new URL("../schema.sql", import.meta.url), "utf8")
     .matchAll(/^\s*\('([^']+)',\s*'(?:weighted|banded)'/gm)].map(m => m[1].toLowerCase())
);

const best = new Map(), bad = [], unknown = new Map();
let noLoad = 0;
for (const r of rows.slice(1)) {
  if (!r.some(c => c.trim())) continue;
  // agentic-fitness-sync prefixes "'" to names that look like spreadsheet formulas.
  let exercise = (r[col.exercise] || "").trim().replace(/^'(?=[=+\-@])/, "");
  exercise = RENAME[exercise] || exercise;
  const reps = parseInt(String(r[col.reps]).replace(/[^\d]/g, ""), 10);
  const rawW = String(r[col.weight] || "");
  let weight = parseFloat(rawW.replace(/[^\d.]/g, ""));
  if (headerSaysLb || /lb/i.test(rawW)) weight = weight * 0.45359237;
  const date = toISODate(r[col.date]);
  if (!exercise || !(reps > 0) || !date) { bad.push(r); continue; }
  if (!(weight > 0)) { noLoad++; continue; }
  weight = Math.round(weight * 100) / 100;
  const key = [exercise.toLowerCase(), reps, date].join("|");
  const cur = best.get(key);
  if (!cur || weight > cur.weight) best.set(key, { exercise, reps, weight, date });
}

const out = [];
for (const { exercise, reps, weight, date } of best.values()) {
  if (!library.has(exercise.toLowerCase())) unknown.set(exercise, (unknown.get(exercise) || 0) + 1);
  const id = ["trainerize", exercise.toLowerCase(), reps, weight, date].join("|");
  out.push(`INSERT OR IGNORE INTO rep_maxes (id, exercise, reps, weight, date, source) VALUES (${q(id)}, ${q(exercise)}, ${reps}, ${weight}, ${q(date)}, 'trainerize');`);
}

const repRows = out.length;
if (withLibrary) {
  for (const n of unknown.keys()) {
    out.push(`INSERT OR IGNORE INTO exercises (name, kind, sets, reps, rest, side, added_by) VALUES (${q(n)}, 'weighted', 3, '8-12', 75, ${/single.arm/i.test(n) ? 1 : 0}, 'trainerize-import');`);
  }
}
console.log(out.join("\n"));
console.error(`${repRows} rep-max rows ready (from ${rows.length - 1} lines), ${noLoad} skipped with no load, ${bad.length} skipped as unreadable.`);
if (bad.length) console.error("first skipped:", bad.slice(0, 3).map(r => r.join(" | ")).join("\n  "));
if (unknown.size) {
  console.error(`\n${unknown.size} exercise name(s) not in the library — they import as their own lifts unless mapped in RENAME${withLibrary ? " (and are added to the library)" : ""}:`);
  for (const [n, c] of unknown) console.error(`  ${n}  (${c} rows)`);
}

function toISODate(s) {
  s = String(s || "").trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  // UK order by default — this is a UK trainer. dd/mm/yyyy.
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) return iso(m[3].length === 2 ? "20" + m[3] : m[3], m[2], m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
function iso(y, mo, d) {
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function die(msg) { console.error(msg); process.exit(1); }

function parseCSV(text) {
  const out = []; let row = [], cell = "", inQ = false;
  const sep = (text.split("\n")[0].match(/\t/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
