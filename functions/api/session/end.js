// POST /api/session/end
// Closes the session in D1 and writes one row into the Notion Training Log.
// Notion stays the system of record; D1 is the working store the app reads from.

const DAY_TO_NOTION = {
  mon: "Mon - Chest+Tri",
  wed: "Wed - Back+Bi",
  thu: "Thu - Shoulders+Arms",
  sat: "Sat - Shoulders+Arms 2",
  tue: "PT Tue",
  fri: "PT Fri"
};

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  if (!b?.date) return json({ error: "no date" }, 400);

  const endedAt = new Date().toISOString();
  const startedAt = b.started_at ? new Date(b.started_at).toISOString() : null;

  // 1. Close the session in D1 first. This must succeed even if Notion is down —
  //    a failed Notion push should never cost Karl the session.
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

  // 2. Read the sets back from D1 rather than trusting the request body,
  //    so the Notion row reflects what was actually stored.
  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT exercise, reps, weight, set_index FROM sets
       WHERE date = ? AND day = ? ORDER BY exercise, set_index`
    ).bind(String(b.date), String(b.day || "")).all();
    rows = r.results || [];
  } catch { /* fall through with what we have */ }

  if (!rows.length && Array.isArray(b.sets)) rows = b.sets;
  if (!rows.length) return json({ ok: true, notion: false, error: "no sets to write" });

  // 3. Push to Notion. Absent credentials is a normal state, not an error —
  //    the daily check-in picks the session up from D1 instead.
  if (!env.NOTION_TOKEN || !env.NOTION_DB) {
    return json({ ok: true, notion: false, error: "Notion credentials not configured" });
  }

  const byEx = {};
  for (const r of rows) (byEx[r.exercise] ||= []).push(r);

  const lifts = Object.entries(byEx)
    .map(([name, rs]) => `${name} — ${rs.map(r => `${r.reps} × ${trim(r.weight)} kg`).join(" / ")}`)
    .join("\n");

  const mins = startedAt ? Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000) : null;
  const totalSets = rows.length;

  const notes =
    `Logged in Iron Log — hard data, not recalled.\n\n${lifts}\n\n` +
    `${Object.keys(byEx).length} exercises, ${totalSets} sets` +
    (mins != null ? `, ${mins} min` : "") + "." +
    (b.notes ? `\n\nKarl's note: ${b.notes}` : "");

  const props = {
    "Session": { title: [{ text: { content:
      `${b.date} — ${DAY_TO_NOTION[b.day] || b.day || "Session"}`.slice(0, 200) } }] },
    "Date":  { date: { start: String(b.date) } },
    "Lifts": { rich_text: [{ text: { content: notes.slice(0, 1990) } }] },
    "Capture": { select: { name: "Iron Log" } }
  };
  if (DAY_TO_NOTION[b.day]) props["Day"] = { select: { name: DAY_TO_NOTION[b.day] } };
  if (b.felt) props["Felt"] = { select: { name: String(b.felt) } };
  if (b.bodyweight != null && !Number.isNaN(Number(b.bodyweight))) {
    props["Bodyweight kg"] = { number: Number(b.bodyweight) };
  }

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.NOTION_TOKEN}`,
        "notion-version": "2022-06-28",
        "content-type": "application/json"
      },
      body: JSON.stringify({ parent: { database_id: env.NOTION_DB }, properties: props })
    });
    const j = await res.json();
    if (!res.ok) return json({ ok: true, notion: false, error: j?.message || `notion http ${res.status}` });

    await env.DB.prepare(`UPDATE sessions SET notion_page_id = ? WHERE date = ? AND day = ?`)
      .bind(j.id, String(b.date), String(b.day || "")).run();

    return json({ ok: true, notion: true, page: j.id });
  } catch (e) {
    return json({ ok: true, notion: false, error: String(e?.message || e) });
  }
}

const trim = n => Math.round(Number(n) * 100) / 100;
function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
