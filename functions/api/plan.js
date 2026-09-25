// GET /api/plan  -> all fourteen slots (seven days × morning/bonus)
// PUT /api/plan  -> change one slot
//   { day, slot, exercises?: [{name, sets, reps, weight}], locked?: bool }
//
// ⭐ A LOCKED SLOT CANNOT BE EDITED. That is the point of locking: once Sophie
// has set a session, nothing — a stray tap on the phone included — changes it
// without an explicit unlock first. The server enforces it, not just the UI,
// so a stale tab cannot overwrite a locked slot either.
//
// Unlock and edit may arrive in one request ({locked:false, exercises:[…]});
// relocking in the same request as an edit is also fine. What is refused is an
// edit to a slot that is locked and stays locked.
import { json, who, DAYS, SLOTS } from "../../lib/api.js";

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT day, slot, exercises, locked, locked_at, locked_by, updated_at, updated_by FROM plan_slots`
    ).all();
    const have = {};
    for (const r of results || []) have[r.day + "|" + r.slot] = r;

    const slots = [];
    for (const day of DAYS) for (const slot of SLOTS) {
      const r = have[day + "|" + slot];
      slots.push(r ? shape(r) : { day, slot, exercises: [], locked: false });
    }
    return json({ slots });
  } catch (e) {
    return json({ slots: [], error: String(e?.message || e) }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const day = String(b?.day || ""), slot = String(b?.slot || "");
  if (!DAYS.includes(day) || !SLOTS.includes(slot)) return json({ error: "unknown day or slot" }, 400);

  const now = new Date().toISOString(), by = who(request);

  try {
    const cur = await env.DB.prepare(
      `SELECT day, slot, exercises, locked, locked_at, locked_by, updated_at, updated_by
         FROM plan_slots WHERE day = ? AND slot = ?`
    ).bind(day, slot).first();

    const wasLocked = !!cur?.locked;
    const locked = typeof b.locked === "boolean" ? b.locked : wasLocked;

    let exercises = cur ? JSON.parse(cur.exercises || "[]") : [];
    if (Array.isArray(b.exercises)) {
      if (wasLocked && b.locked !== false) {
        return json({ error: "This slot is locked. Unlock it before changing it.", slot: cur ? shape(cur) : null }, 409);
      }
      exercises = cleanExercises(b.exercises);
      if (exercises === null) return json({ error: "each exercise needs a name" }, 400);
    }
    if (locked && !exercises.length) return json({ error: "An empty slot cannot be locked." }, 400);

    const lockedAt = locked ? (wasLocked ? cur.locked_at : now) : null;
    const lockedBy = locked ? (wasLocked ? cur.locked_by : by) : null;

    await env.DB.prepare(
      `INSERT INTO plan_slots (day, slot, exercises, locked, locked_at, locked_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day, slot) DO UPDATE SET
         exercises = excluded.exercises, locked = excluded.locked,
         locked_at = excluded.locked_at, locked_by = excluded.locked_by,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(day, slot, JSON.stringify(exercises), locked ? 1 : 0, lockedAt, lockedBy, now, by).run();

    return json({ ok: true, slot: {
      day, slot, exercises, locked, locked_at: lockedAt, locked_by: lockedBy, updated_at: now, updated_by: by
    }});
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

function cleanExercises(list) {
  if (list.length > 12) list = list.slice(0, 12);
  const out = [];
  for (const x of list) {
    const name = String(x?.name || "").trim();
    if (!name) return null;
    const sets = parseInt(x.sets, 10);
    const w = x.weight === "" || x.weight == null ? null : Number(x.weight);
    out.push({
      name,
      sets: Number.isFinite(sets) ? Math.min(12, Math.max(1, sets)) : 3,
      reps: String(x.reps || "").trim().slice(0, 20) || "8-12",
      weight: Number.isFinite(w) && w >= 0 ? w : null
    });
  }
  return out;
}

function shape(r) {
  return {
    day: r.day, slot: r.slot, exercises: JSON.parse(r.exercises || "[]"),
    locked: !!r.locked, locked_at: r.locked_at || null, locked_by: r.locked_by || null,
    updated_at: r.updated_at || null, updated_by: r.updated_by || null
  };
}
