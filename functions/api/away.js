// GET /api/away  -> the days Karl is away, from today to eight weeks out
//   { connected: true,  days: ["2026-10-03", ...], checkedAt }
//   { connected: false }                      when no calendar is configured
//
// Read live from the private iCal address of Karl's Google "Travel" calendar,
// held as the Pages secret TRAVEL_ICS_URL. Nothing is copied into D1: the
// calendar stays the one record of where he is, and a trip added or cancelled
// there shows up here within the cache window below, with nobody re-syncing.
//
// ⚠️ ONLY DATES LEAVE THIS FUNCTION. The feed carries trip names, places,
// flight numbers and seats; Sophie needs to know when, not where or why. So
// no title, location or description is ever put in the response.
//
// A day counts as away if any Travel event touches it. All-day events run
// from DTSTART to the day before DTEND (Google's end date is exclusive). A
// timed event covers every date it spans in London time. Recurring events
// are not expanded — trips are one-offs; a repeating one counts once.
const WINDOW_DAYS = 56;
const CACHE_SECONDS = 900;
const TZ = "Europe/London";

export async function onRequestGet({ request, env, waitUntil }) {
  const src = env.TRAVEL_ICS_URL;
  if (!src) return json({ connected: false });

  // Cached by the Worker, not the browser, so a trip edited in Google shows
  // up for everyone within fifteen minutes without hammering Google.
  const cacheKey = new Request(new URL("/api/away?v=1", request.url).toString());
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let text;
  try {
    const r = await fetch(src, { headers: { accept: "text/calendar" } });
    if (!r.ok) throw new Error("the calendar answered " + r.status);
    text = await r.text();
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("that address did not return a calendar");
  } catch (e) {
    // Never cached, so the next request tries again.
    return json({ connected: true, error: String(e?.message || e), days: [] }, 502);
  }

  const today = londonDate(new Date());
  const last = addDays(today, WINDOW_DAYS);
  const days = new Set();
  for (const ev of parseEvents(text)) {
    if (ev.status === "CANCELLED") continue;
    for (let d = ev.start; d <= ev.end; d = addDays(d, 1)) {
      if (d >= today && d <= last) days.add(d);
    }
  }

  const res = json({ connected: true, days: [...days].sort(), checkedAt: new Date().toISOString(),
                     from: today, to: last });
  res.headers.set("cache-control", `private, max-age=0, s-maxage=${CACHE_SECONDS}`);
  const put = cache.put(cacheKey, res.clone());
  if (waitUntil) waitUntil(put); else await put;
  return res;
}

// Minimal RFC 5545 reading: unfold, split into VEVENTs, and resolve each to an
// inclusive start..end range of London dates.
export function parseEvents(ics) {
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur?.DTSTART) {
        const s = when(cur.DTSTART), e = cur.DTEND ? when(cur.DTEND) : null;
        let end;
        if (s.allDay) end = e ? addDays(e.date, -1) : s.date;          // DTEND is exclusive
        else if (!e) end = s.date;
        else end = e.midnight && e.date > s.date ? addDays(e.date, -1) : e.date;
        if (end < s.date) end = s.date;
        out.push({ start: s.date, end, status: (cur.STATUS?.value || "").toUpperCase() });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (m) cur[m[1]] = { params: m[2], value: m[3] };
  }
  return out;
}

function when(p) {
  const v = p.value.trim();
  if (/VALUE=DATE(?!-)/.test(p.params) || /^\d{8}$/.test(v)) {
    return { allDay: true, date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return { allDay: true, date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
  if (m[7] === "Z") {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    const date = londonDate(d);
    const hm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    return { allDay: false, date, midnight: hm === "00:00" };
  }
  // Local time with a TZID (or floating): the date as written is the date there.
  return { allDay: false, date: `${m[1]}-${m[2]}-${m[3]}`, midnight: m[4] === "00" && m[5] === "00" };
}

function londonDate(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
