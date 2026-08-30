// POST /api/session/end
// Closes the session in D1. D1 is the whole record — there is no second store
// and nothing to reconcile.

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  if (!b?.date) return json({ error: "no date" }, 400);

  const endedAt = new Date().toISOString();
  const startedAt = b.started_at ? new Date(b.started_at).toISOString() : null;

  try {
    await env.DB.prepare(
      `INSERT INTO sessions (date, day, started_at, ended_at, bodyweight, felt, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, day) DO UPDATE SET
         ended_at=excluded.ended_at, bodyweight=excluded.bodyweight,
         felt=excluded.felt, notes=excluded.notes`
    ).bind(
      String(b.date), String(b.day || ""), startedAt, endedAt,
      b.bodyweight == null ? null : Number(b.bodyweight),
      String(b.felt || ""), String(b.notes || "")
    ).run();
  } catch (e) {
    return json({ error: "d1: " + String(e?.message || e) }, 500);
  }

  // Report back what actually landed, read from D1 rather than from the request
  // body, so the confirmation reflects what was stored and not what was sent.
  let sets = 0, exercises = 0;
  try {
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS sets, COUNT(DISTINCT exercise) AS exercises
       FROM sets WHERE date = ? AND day = ?`
    ).bind(String(b.date), String(b.day || "")).first();
    sets = r?.sets || 0;
    exercises = r?.exercises || 0;
  } catch { /* the session is committed either way */ }

  const mins = startedAt
    ? Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000)
    : null;

  return json({ ok: true, sets, exercises, minutes: mins });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
