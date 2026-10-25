// POST /api/prompt-notes
//   { notes: [ {id, prompt_id, session_id, text, created_at}, ... ] }
//
// The client generates the id, so a batch retried from the offline queue is a
// no-op the second time (INSERT OR IGNORE). A note is never edited here.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const notes = (Array.isArray(body?.notes) ? body.notes : [])
    .filter(n => n && n.id && n.prompt_id && String(n.text || "").trim());
  if (!notes.length) return json({ ok: true, written: 0 });
  if (notes.length > 200) return json({ error: "too many notes in one batch" }, 413);

  const ins = env.DB.prepare(
    `INSERT OR IGNORE INTO prompt_notes (id, prompt_id, session_id, text, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  try {
    const res = await env.DB.batch(notes.map(n => ins.bind(
      String(n.id).slice(0, 64),
      Number(n.prompt_id),
      String(n.session_id || "").slice(0, 64),
      String(n.text).trim().slice(0, 4000),
      iso(n.created_at)
    )));
    const written = res.reduce((a, r) => a + (r.meta?.changes || 0), 0);
    return json({ ok: true, written });
  } catch (e) {
    return json({ error: "d1: " + String(e?.message || e) }, 500);
  }
}

function iso(t) {
  const d = new Date(t || Date.now());
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
