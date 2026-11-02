// Shared by the planner endpoints. Lives outside functions/ so Pages never
// mistakes it for a route. The older endpoints keep their own copies of json().

export function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

// Who is making the change. Cloudflare Access puts the signed-in email on every
// request it lets through, so the planner can say "locked by Sophie" without a
// login system of its own. Local dev has no Access, hence the fallback.
export function who(request) {
  return request.headers.get("cf-access-authenticated-user-email") || "local";
}

export const DAYS  = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const SLOTS = ["morning", "bonus"];

// The Planner's filter vocabulary. The page reads these from /api/exercises so
// the two can never disagree.
export const MUSCLES   = ["Chest", "Back", "Shoulders", "Traps", "Biceps", "Triceps", "Legs", "Core", "Full body"];
export const EQUIPMENT = ["barbell", "dumbbell", "band", "bodyweight", "kettlebell", "other"];

// Band levels, lightest to heaviest. A banded set stores its level as a number
// so comparisons (last time, rep maxes, targets) still work: R = 11, B = 12,
// P = 13, G = 14. Anything else logged on a banded lift predates the letters
// (the old 1-5 levels) and reads as P. Must match `bands` in public/programme.js
// — test/week.test.mjs checks the two agree.
export const BANDS = { levels: ["R", "B", "P", "G"], base: 10, legacy: "P" };
export function bandLabel(w) {
  const n = Number(w), i = n - BANDS.base - 1;
  return Number.isInteger(n) && i >= 0 && i < BANDS.levels.length ? BANDS.levels[i] : BANDS.legacy;
}
// The names of the banded lifts, from the library.
export async function bandedNames(env) {
  const { results } = await env.DB.prepare(`SELECT name FROM exercises WHERE kind = 'banded'`).all();
  return new Set((results || []).map(r => String(r.name).toLowerCase()));
}
