// POST /api/sets
//   { sets:    [ {id,date,day,exercise,set_index,reps,weight,ts,edited_at?}, ... ],
//     deletes: [ {id}, ... ] }
//
// The client generates the id, so a retried batch never double-writes.
//
// ⚠️ WHY THIS IS AN UPSERT AND NOT `INSERT OR IGNORE`. An edit is the same set
// with different numbers, so it has to be able to land on a row that already
// exists — but a plain upsert would let a stale retry, sitting in an outbox
// since before the edit, overwrite the correction on its way through. The guard
// is `edited_at`: an original log has none, so a replayed original can never
// beat an edit, and a later edit always beats an earlier one. Retries stay
// no-ops, which is what made the original endpoint safe.
//
// `ts` keeps meaning "when the set was performed" and is never bumped by an
// edit. Editing a typo does not move the set in time.
//
// SETS ARE APPLIED BEFORE DELETES, deliberately. A set logged and then deleted
// while offline arrives as both in one batch; inserting first and deleting
// second leaves nothing behind, which is what happened. The other order leaves
// an orphan row that no client will ever mention again.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const sets    = Array.isArray(body?.sets)    ? body.sets    : [];
  const deletes = Array.isArray(body?.deletes) ? body.deletes : [];
  if (!sets.length && !deletes.length) return json({ ok: true, written: 0, removed: 0 });
  if (sets.length > 500 || deletes.length > 500) return json({ error: "too many rows in one batch" }, 413);

  const up = env.DB.prepare(
    `INSERT INTO sets (id, date, day, exercise, set_index, reps, weight, ts, edited_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       exercise  = excluded.exercise,
       set_index = excluded.set_index,
       reps      = excluded.reps,
       weight    = excluded.weight,
       edited_at = excluded.edited_at
     WHERE COALESCE(excluded.edited_at, '') > COALESCE(sets.edited_at, sets.ts)`
  );
  const del = env.DB.prepare(`DELETE FROM sets WHERE id = ?`);

  const writes = [], removals = [];
  for (const s of sets) {
    if (!s?.id || !s?.date || !s?.exercise) continue;
    writes.push(up.bind(
      String(s.id), String(s.date), String(s.day || ""), String(s.exercise),
      Number(s.set_index) || 0, Number(s.reps) || 0, Number(s.weight) || 0,
      String(s.ts || new Date().toISOString()),
      s.edited_at ? String(s.edited_at) : null
    ));
  }
  for (const d of deletes) {
    const id = typeof d === "string" ? d : d?.id;
    if (id) removals.push(del.bind(String(id)));
  }

  try {
    let written = 0, removed = 0;
    if (writes.length) {
      const r = await env.DB.batch(writes);
      written = r.reduce((n, x) => n + (x?.meta?.changes || 0), 0);
    }
    if (removals.length) {
      const r = await env.DB.batch(removals);
      removed = r.reduce((n, x) => n + (x?.meta?.changes || 0), 0);
    }
    // Report real changes, not the size of what was sent, or the client cannot
    // tell a retry from a write.
    return json({ ok: true, received: writes.length, written, removed });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
