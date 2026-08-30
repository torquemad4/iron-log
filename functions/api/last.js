// GET /api/last?day=thu
// For each exercise trained on the most recent PREVIOUS occurrence of that day,
// return what was lifted, so the app can prefill and show the progression target.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const day = url.searchParams.get("day") || "";
  const today = new Date().toISOString().slice(0, 10);

  try {
    const prev = await env.DB.prepare(
      `SELECT date FROM sets WHERE day = ? AND date < ? ORDER BY date DESC LIMIT 1`
    ).bind(day, today).first();

    if (!prev) return json({ last: {} });

    const { results } = await env.DB.prepare(
      `SELECT exercise, reps, weight, set_index FROM sets
       WHERE day = ? AND date = ? ORDER BY exercise, set_index`
    ).bind(day, prev.date).all();

    const byEx = {};
    for (const r of results || []) {
      (byEx[r.exercise] ||= []).push(r);
    }

    const last = {};
    for (const [name, rows] of Object.entries(byEx)) {
      // Heaviest set drives the prefill; if tied on weight, the one with most reps.
      const top = rows.reduce((a, b) =>
        (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps)) ? b : a);
      last[name] = {
        date: prev.date,
        summary: rows.map(r => `${r.reps}×${trimNum(r.weight)}`).join(", "),
        topReps: top.reps,
        topWeight: trimNum(top.weight),
        sets: rows.length
      };
    }
    return json({ last, date: prev.date });
  } catch (e) {
    return json({ last: {}, error: String(e?.message || e) }, 500);
  }
}

const trimNum = n => Math.round(Number(n) * 100) / 100;
function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
