// GET /api/week-status?date=2026-08-31
//
// What has actually been logged in the Mon–Sun week containing `date`.
//
// Two of the programme's rules need this and cannot be answered from the phone:
//   1. A bonus session must NOT satisfy the day's core session. The UI has to
//      keep showing an unlogged core day as outstanding even after a bonus.
//   2. The pool of missed work and the weekly volume tally (public/week.js) are
//      worked out from what was logged per day × exercise — `rows` below.
//
// The client asks with the date on the Europe/London clock, so the week here is
// the pool's week: it ends Sunday 23:59 London time.
export async function onRequestGet({ request, env }) {
  const date = new URL(request.url).searchParams.get("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return json({ error: "date=YYYY-MM-DD is required" }, 400);
  }

  // Monday-start week containing `date`.
  const d = new Date(date + "T00:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7;            // Mon=0 … Sun=6
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - shift);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = x => x.toISOString().slice(0, 10);

  try {
    const { results } = await env.DB.prepare(
      `SELECT day, date, COUNT(*) AS sets, COUNT(DISTINCT exercise) AS exercises
         FROM sets WHERE date >= ? AND date <= ?
        GROUP BY day, date ORDER BY date`
    ).bind(iso(monday), iso(sunday)).all();

    const { results: rows } = await env.DB.prepare(
      `SELECT day, date, exercise, COUNT(*) AS sets
         FROM sets WHERE date >= ? AND date <= ?
        GROUP BY day, date, exercise ORDER BY date`
    ).bind(iso(monday), iso(sunday)).all();

    const core = {}, bonus = [];
    for (const r of results || []) {
      if (String(r.day).startsWith("bonus:")) {
        bonus.push({ id: String(r.day).slice(6), date: r.date, sets: r.sets, exercises: r.exercises });
      } else {
        // A day could in principle be logged across two dates; keep the newest.
        const cur = core[r.day];
        if (!cur || r.date > cur.date) core[r.day] = { date: r.date, sets: r.sets, exercises: r.exercises };
        else { cur.sets += r.sets; }
      }
    }
    return json({ weekStart: iso(monday), weekEnd: iso(sunday), core, bonus, rows: rows || [] });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
