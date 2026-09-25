// GET  /api/rep-maxes                 -> every exercise that has any record
// GET  /api/rep-maxes?ex=DB+Curl      -> just that one
// POST /api/rep-maxes                 -> bulk import
//   { rows: [ {exercise, reps, weight, date, source?, note?}, ... ] }
//
// A rep max here is "the heaviest load moved for N reps, on a date". Two
// sources feed it and neither is copied into the other:
//   - rep_maxes: history imported from Trainerize (source = "trainerize")
//   - sets:      everything logged in Iron Log itself
// They are merged at read time, so a lift keeps one history even though it
// started in Trainerize and carried on here.
//
// For each exercise and rep count the response gives the BEST (heaviest, then
// earliest) and the full HISTORY: every date on which that rep count was done,
// with the top load that day, so progress over time is visible, not just the peak.
import { json } from "../../lib/api.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const only = url.searchParams.getAll("ex").filter(Boolean).slice(0, 40);
  const where = only.length ? `WHERE exercise IN (${only.map(() => "?").join(",")})` : "";

  try {
    const [imp, own, count] = await Promise.all([
      env.DB.prepare(
        `SELECT exercise, reps, MAX(weight) AS weight, date, source
           FROM rep_maxes ${where} GROUP BY exercise, reps, date, source`
      ).bind(...only).all(),
      env.DB.prepare(
        `SELECT exercise, reps, MAX(weight) AS weight, date, 'ironlog' AS source
           FROM sets ${where} GROUP BY exercise, reps, date`
      ).bind(...only).all(),
      env.DB.prepare(`SELECT COUNT(*) AS n, MAX(created_at) AS last FROM rep_maxes`).first()
    ]);

    const byEx = {};
    for (const r of [...(imp.results || []), ...(own.results || [])]) {
      if (!(r.reps > 0)) continue;
      const key = String(r.exercise).toLowerCase();
      const ex = (byEx[key] ||= { exercise: r.exercise, reps: {} });
      (ex.reps[r.reps] ||= []).push({ weight: trim(r.weight), date: r.date, source: r.source });
    }

    const exercises = Object.values(byEx).map(ex => ({
      exercise: ex.exercise,
      maxes: Object.entries(ex.reps)
        .map(([reps, hist]) => {
          hist.sort((a, b) => a.date.localeCompare(b.date));
          const best = hist.reduce((a, b) => (b.weight > a.weight ? b : a));
          return { reps: Number(reps), best, history: hist };
        })
        .sort((a, b) => a.reps - b.reps)
    })).sort((a, b) => a.exercise.localeCompare(b.exercise));

    return json({ exercises, imported: { rows: count?.n || 0, last: count?.last || null } });
  } catch (e) {
    return json({ exercises: [], error: String(e?.message || e) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const rows = Array.isArray(b?.rows) ? b.rows : [];
  if (!rows.length) return json({ ok: true, received: 0, written: 0 });
  if (rows.length > 2000) return json({ error: "too many rows in one batch" }, 413);

  const ins = env.DB.prepare(
    `INSERT OR IGNORE INTO rep_maxes (id, exercise, reps, weight, date, source, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const writes = [], rejected = [];
  for (const r of rows) {
    const exercise = String(r?.exercise || "").trim();
    const reps = parseInt(r?.reps, 10);
    const weight = Number(r?.weight);
    const date = String(r?.date || "").slice(0, 10);
    const source = String(r?.source || "trainerize").slice(0, 40);
    if (!exercise || !(reps > 0) || !Number.isFinite(weight) || weight < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      rejected.push(r); continue;
    }
    // Content-derived id: the same export imported twice writes nothing twice.
    const id = [source, exercise.toLowerCase(), reps, trim(weight), date].join("|");
    writes.push(ins.bind(id, exercise, reps, trim(weight), date, source, r.note ? String(r.note).slice(0, 200) : null));
  }

  try {
    let written = 0;
    for (let i = 0; i < writes.length; i += 100) {
      const res = await env.DB.batch(writes.slice(i, i + 100));
      written += res.reduce((n, x) => n + (x?.meta?.changes || 0), 0);
    }
    return json({ ok: true, received: rows.length, written, rejected: rejected.length,
                  rejectedSample: rejected.slice(0, 5) });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

const trim = n => Math.round(Number(n) * 100) / 100;
