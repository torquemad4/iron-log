// GET /api/prompts
// The active "think about" prompts, each with every note written against it,
// newest first. Prompts are created and retired by SQL (Cowork); there is no
// write path for them here.
export async function onRequestGet({ env }) {
  try {
    const { results: prompts } = await env.DB.prepare(
      `SELECT id, text, context, thread, created_at
         FROM prompts WHERE active = 1 ORDER BY created_at, id`
    ).all();
    if (!prompts?.length) return json({ prompts: [] });

    const marks = prompts.map(() => "?").join(",");
    const { results: notes } = await env.DB.prepare(
      `SELECT id, prompt_id, session_id, text, created_at
         FROM prompt_notes WHERE prompt_id IN (${marks})
        ORDER BY created_at DESC LIMIT 500`
    ).bind(...prompts.map(p => p.id)).all();

    const byPrompt = {};
    for (const n of notes || []) (byPrompt[n.prompt_id] ||= []).push(n);
    return json({ prompts: prompts.map(p => ({ ...p, notes: byPrompt[p.id] || [] })) });
  } catch (e) {
    return json({ prompts: [], error: String(e?.message || e) }, 500);
  }
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
