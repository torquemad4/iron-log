// GET /api/history?limit=15        -> summarised sessions for the history sheet
// GET /api/history?limit=1000&raw=1 -> every set, for the JSON export
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "15", 10) || 15, 2000);
  const raw = url.searchParams.get("raw") === "1";

  try {
    if (raw) {
      const { results } = await env.DB.prepare(
        `SELECT id, date, day, exercise, set_index, reps, weight, ts
         FROM sets ORDER BY ts DESC LIMIT ?`
      ).bind(limit).all();
      return json({ exported_at: new Date().toISOString(), entries: results || [] });
    }

    const { results: dates } = await env.DB.prepare(
      `SELECT DISTINCT date, day FROM sets ORDER BY date DESC LIMIT ?`
    ).bind(limit).all();

    const sessions = [];
    for (const d of dates || []) {
      const { results: rows } = await env.DB.prepare(
        `SELECT exercise, reps, weight FROM sets WHERE date = ? ORDER BY exercise, set_index`
      ).bind(d.date).all();

      const byEx = {};
      for (const r of rows || []) (byEx[r.exercise] ||= []).push(r);
      sessions.push({
        date: d.date,
        day: d.day,
        summary: Object.entries(byEx)
          .map(([n, rs]) => `${n}: ${rs.map(r => `${r.reps}×${Math.round(r.weight * 100) / 100}`).join(", ")}`)
          .join(" · ")
      });
    }
    return json({ sessions });
  } catch (e) {
    return json({ sessions: [], error: String(e?.message || e) }, 500);
  }
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
