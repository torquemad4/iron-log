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
export const MUSCLES   = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Full body"];
export const EQUIPMENT = ["barbell", "dumbbell", "band", "bodyweight", "kettlebell", "other"];
