// GET  /api/exercises          -> the whole library
// POST /api/exercises          -> add one, or update it if the name exists
//   { name, kind: "weighted"|"banded", sets, reps, weight?, rest?, step?, side? }
//
// Names are unique case-insensitively, because "DB Curl" and "db curl" are the
// same lift and splitting them would split its history.
import { json, who } from "../../lib/api.js";

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT name, kind, sets, reps, weight, rest, step, side, added_by
         FROM exercises ORDER BY name COLLATE NOCASE`
    ).all();
    return json({ exercises: (results || []).map(shape) });
  } catch (e) {
    return json({ exercises: [], error: String(e?.message || e) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const name = String(b?.name || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) return json({ error: "a name is needed (80 characters at most)" }, 400);
  const kind = b.kind === "banded" ? "banded" : "weighted";
  const sets = clampInt(b.sets, 1, 12, 3);
  const reps = String(b.reps || "").trim().slice(0, 20) || "8-12";
  const weight = numOrNull(b.weight);
  const rest = clampInt(b.rest, 0, 600, 75);
  const step = numOrNull(b.step);
  const side = b.side ? 1 : 0;

  try {
    await env.DB.prepare(
      `INSERT INTO exercises (name, kind, sets, reps, weight, rest, step, side, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         kind = excluded.kind, sets = excluded.sets, reps = excluded.reps,
         weight = excluded.weight, rest = excluded.rest, step = excluded.step,
         side = excluded.side`
    ).bind(name, kind, sets, reps, weight, rest, step, side, who(request)).run();
    const row = await env.DB.prepare(
      `SELECT name, kind, sets, reps, weight, rest, step, side, added_by FROM exercises WHERE name = ?`
    ).bind(name).first();
    return json({ ok: true, exercise: shape(row) });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

function shape(r) {
  return {
    name: r.name, kind: r.kind, sets: r.sets, reps: r.reps,
    weight: r.weight, rest: r.rest, step: r.step, side: !!r.side, added_by: r.added_by || null
  };
}
function clampInt(v, lo, hi, fb) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
}
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
