// POST /api/sets  { sets: [ {id,date,day,exercise,set_index,reps,weight,ts}, ... ] }
// Idempotent: the client generates the id, so a retried batch never double-writes.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const sets = Array.isArray(body?.sets) ? body.sets : [];
  if (!sets.length) return json({ ok: true, written: 0 });
  if (sets.length > 500) return json({ error: "too many sets in one batch" }, 413);

  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO sets (id, date, day, exercise, set_index, reps, weight, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const batch = [];
  for (const s of sets) {
    if (!s?.id || !s?.date || !s?.exercise) continue;
    batch.push(stmt.bind(
      String(s.id), String(s.date), String(s.day || ""), String(s.exercise),
      Number(s.set_index) || 0, Number(s.reps) || 0, Number(s.weight) || 0,
      String(s.ts || new Date().toISOString())
    ));
  }
  if (!batch.length) return json({ ok: true, written: 0 });

  try {
    const res = await env.DB.batch(batch);
    // INSERT OR IGNORE means a replayed batch writes nothing — report real inserts,
    // not the size of what was sent, or the client can't tell a retry from a write.
    const written = res.reduce((n, r) => n + (r?.meta?.changes || 0), 0);
    return json({ ok: true, received: batch.length, written });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
