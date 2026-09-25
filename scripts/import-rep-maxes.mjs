#!/usr/bin/env node
// Turn a rep-max export (Trainerize, or anything tabular) into SQL for D1.
//
//   node scripts/import-rep-maxes.mjs export.csv > rep-maxes.sql
//   npx wrangler d1 execute ironlog --remote --file=rep-maxes.sql
//
// ⚠️ THE TRAINERIZE FORMAT HAS NOT BEEN SEEN YET. This was written before the
// first export existed, so it reads columns by NAME, not position, and accepts
// the obvious spellings of each. If the real file does not fit, it stops and
// prints the headers it found rather than guessing — extend ALIASES below and
// run it again. Nothing is written by this script; it only prints SQL.
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
  weight:   ["weight", "load", "weight (kg)", "weight kg", "kg", "weight (lbs)", "weight lbs", "lbs", "max", "max weight"],
  date:     ["date", "workout date", "completed", "completed date", "day", "performed"]
};

// Trainerize name -> library name. Fill in as mismatches are reported.
const RENAME = {
};

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/import-rep-maxes.mjs <export.csv>"); process.exit(1); }

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

const out = [], bad = [], unknown = new Map();
for (const r of rows.slice(1)) {
  if (!r.some(c => c.trim())) continue;
  let exercise = (r[col.exercise] || "").trim();
  exercise = RENAME[exercise] || exercise;
  const reps = parseInt(String(r[col.reps]).replace(/[^\d]/g, ""), 10);
  const rawW = String(r[col.weight] || "");
  let weight = parseFloat(rawW.replace(/[^\d.]/g, ""));
  if (headerSaysLb || /lb/i.test(rawW)) weight = weight * 0.45359237;
  const date = toISODate(r[col.date]);
  if (!exercise || !(reps > 0) || !Number.isFinite(weight) || !date) { bad.push(r); continue; }
  if (!library.has(exercise.toLowerCase())) unknown.set(exercise, (unknown.get(exercise) || 0) + 1);
  weight = Math.round(weight * 100) / 100;
  const id = ["trainerize", exercise.toLowerCase(), reps, weight, date].join("|");
  out.push(`INSERT OR IGNORE INTO rep_maxes (id, exercise, reps, weight, date, source) VALUES (${q(id)}, ${q(exercise)}, ${reps}, ${weight}, ${q(date)}, 'trainerize');`);
}

console.log(out.join("\n"));
console.error(`${out.length} rows ready, ${bad.length} skipped as unreadable.`);
if (bad.length) console.error("first skipped:", bad.slice(0, 3).map(r => r.join(" | ")).join("\n  "));
if (unknown.size) {
  console.error(`\n${unknown.size} exercise name(s) not in the library — they will import as NEW lifts unless mapped in RENAME:`);
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
