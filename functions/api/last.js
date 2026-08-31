// GET /api/last?ex=Single-Arm+DB+Row&ex=Band+Face+Pull&date=2026-08-31&day=mon
//
// ⭐ Keyed on the EXERCISE, not the day. Bonus and core sessions share lifts —
// DB Lateral Raise is in wed and b1, Skull Crusher in weekend and b5 — and if
// prefill came from "the last time this DAY was performed" the two copies of the
// same lift would drift apart and progression would quietly break. The last time
// you did the lift is the last time you did the lift, whatever session it was in.
//
// date+day identify the session in progress so it excludes itself: a core
// session earlier today should inform a bonus session this evening, but the
// sets you just logged should not become your own prefill.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const names = url.searchParams.getAll("ex").filter(Boolean).slice(0, 12);
  const date = url.searchParams.get("date") || "";
  const day = url.searchParams.get("day") || "";

  if (!names.length) return json({ last: {} });

  try {
    const marks = names.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT exercise, date, day, set_index, reps, weight, ts
         FROM sets
        WHERE exercise IN (${marks})
          AND NOT (date = ? AND day = ?)
        ORDER BY exercise, ts DESC`
    ).bind(...names, date, day).all();

    // For each exercise take the most recent session it appeared in, then every
    // set from that session — the whole session, not just its top set, because
    // "12, 12, 10" and "12" are different pieces of information at the rack.
    const byEx = {};
    for (const r of results || []) (byEx[r.exercise] ||= []).push(r);

    const last = {};
    for (const [name, rows] of Object.entries(byEx)) {
      const head = rows[0];
      const session = rows.filter(r => r.date === head.date && r.day === head.day)
                          .sort((a, b) => a.set_index - b.set_index);
      const top = session.reduce((a, b) =>
        (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps)) ? b : a);
      last[name] = {
        date: head.date,
        day: head.day,
        summary: session.map(r => `${r.reps}×${trim(r.weight)}`).join(", "),
        topReps: top.reps,
        topWeight: trim(top.weight),
        sets: session.length,
      };
    }
    return json({ last });
  } catch (e) {
    return json({ last: {}, error: String(e?.message || e) }, 500);
  }
}

const trim = n => Math.round(Number(n) * 100) / 100;
function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
