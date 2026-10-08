// The week's arithmetic: the POOL of missed work and the per-muscle VOLUME
// TALLY. Pure functions of the programme (programme.js) and what was logged —
// nothing here is stored. The pool is never written down anywhere, so it
// cannot drift from the sets that define it, and "resetting" it is simply the
// week rolling over.
//
// THE POOL
//   - A planned set not logged by the end of its planned day goes into it.
//     "End of day" is midnight Europe/London, whatever the phone's clock says.
//   - Pool work is logged under day = "pool" and pays off the oldest missed
//     sets of that exercise first. A swap done instead (Alternatives — a hotel
//     with no barbell) is logged under its own name with day = "pool:<the
//     lift it replaces>", and pays off that lift.
//   - The week is Mon–Sun on the London clock, so the pool clears at Sunday
//     23:59 Europe/London: unfinished items drop off and Monday starts clean.
//   - Wednesday is satisfied by a PT session (any set logged under day = "pt"
//     that week) as well as by its own sets.
//
// Loaded as a plain script by the page, and by the tests under node.
(function (root) {
  "use strict";

  var ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  // Today's date on a given IANA clock, as YYYY-MM-DD.
  function todayIn(tz, now) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(now || new Date());
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return o.year + "-" + o.month + "-" + o.day;
  }

  // The Mon–Sun week containing an ISO date: { mon: "2026-09-28", ..., sun }.
  function weekDates(iso) {
    var d = new Date(iso + "T12:00:00Z");
    var shift = (d.getUTCDay() + 6) % 7;
    var out = {};
    ORDER.forEach(function (k, i) {
      var x = new Date(d);
      x.setUTCDate(d.getUTCDate() - shift + i);
      out[k] = x.toISOString().slice(0, 10);
    });
    return out;
  }

  function key(s) { return String(s).toLowerCase(); }

  // Server rows ({day, date, exercise, sets}) plus this device's sets for
  // today. Today's local sets may not have synced yet, and may also already be
  // on the server: take the larger count per day × exercise, never the sum.
  function mergeRows(serverRows, localSets, today) {
    var out = {}, order = [];
    function put(r, n, max) {
      var k = r.day + "|" + r.date + "|" + key(r.exercise);
      if (!out[k]) { out[k] = { day: r.day, date: r.date, exercise: r.exercise, sets: 0 }; order.push(k); }
      out[k].sets = max ? Math.max(out[k].sets, n) : out[k].sets + n;
    }
    (serverRows || []).forEach(function (r) { put(r, Number(r.sets) || 0, false); });
    var local = {};
    (localSets || []).forEach(function (s) {
      if (s.date !== today) return;
      var k = s.day + "|" + key(s.exercise);
      (local[k] = local[k] || { day: s.day, date: s.date, exercise: s.exercise, n: 0 }).n++;
    });
    Object.keys(local).forEach(function (k) { put(local[k], local[k].n, true); });
    return order.map(function (k) { return out[k]; });
  }

  function countWhere(rows, pred) {
    var n = 0;
    rows.forEach(function (r) { if (pred(r)) n += Number(r.sets) || 0; });
    return n;
  }

  // Pool work: day "pool" (the lift itself) or "pool:<lift>" (a swap for it).
  function isPoolDay(day) { return day === "pool" || String(day).indexOf("pool:") === 0; }
  // Which pooled lift a logged row pays off (lower-cased), or null.
  function poolTarget(r) {
    if (r.day === "pool") return key(r.exercise);
    if (String(r.day).indexOf("pool:") === 0) return key(String(r.day).slice(5));
    return null;
  }

  // planned sets per exercise for one day, in block order
  function plannedFor(day) {
    var list = [], at = {};
    (day.blocks || []).forEach(function (b) {
      b.forEach(function (s) {
        var k = key(s.ex);
        if (at[k] == null) { at[k] = list.length; list.push({ exercise: s.ex, sets: 0, reps: s.reps, kit: s.kit }); }
        list[at[k]].sets += s.sets;
      });
    });
    return list;
  }

  // The pool for the week containing `today` (YYYY-MM-DD on the London clock).
  // rows: everything logged that week, as {day, date, exercise, sets}.
  function computePool(prog, rows, today) {
    var dates = weekDates(today);
    rows = (rows || []).filter(function (r) { return r.date >= dates.mon && r.date <= dates.sun; });
    var ptDone = rows.some(function (r) { return r.day === "pt" && r.sets > 0; });

    // 1. What each finished day missed.
    var missed = [];
    ORDER.forEach(function (d) {
      var day = prog.days[d];
      if (!day || !(dates[d] < today)) return;          // not planned, or not over yet
      if (day.ptAlternative && ptDone) return;
      plannedFor(day).forEach(function (p) {
        // The lift itself, or a swap done for it that day (day = "mon:<lift>").
        var done = countWhere(rows, function (r) {
          return (r.day === d && key(r.exercise) === key(p.exercise)) || key(r.day) === key(d + ":" + p.exercise);
        });
        if (p.sets > done) {
          missed.push({ day: d, date: dates[d], exercise: p.exercise, reps: p.reps, kit: p.kit,
                        planned: p.sets, missed: p.sets - done, remaining: p.sets - done });
        }
      });
    });

    // 2. Pool work pays off the oldest first.
    var paid = {};
    rows.forEach(function (r) {
      var k = poolTarget(r);
      if (k) paid[k] = (paid[k] || 0) + (Number(r.sets) || 0);
    });
    missed.forEach(function (m) {
      var k = key(m.exercise), take = Math.min(paid[k] || 0, m.remaining);
      m.remaining -= take;
      paid[k] = (paid[k] || 0) - take;
    });

    var items = missed.filter(function (m) { return m.remaining > 0; });

    // 3. One line per exercise, for the pool session.
    var byEx = [], at = {};
    items.forEach(function (m) {
      var k = key(m.exercise);
      if (at[k] == null) { at[k] = byEx.length; byEx.push({ exercise: m.exercise, reps: m.reps, kit: m.kit, remaining: 0, from: [] }); }
      byEx[at[k]].remaining += m.remaining;
      byEx[at[k]].from.push({ day: m.day, sets: m.remaining });
    });

    return {
      weekStart: dates.mon, weekEnd: dates.sun,
      items: items, exercises: byEx,
      total: items.reduce(function (n, m) { return n + m.remaining; }, 0)
    };
  }

  // Sets per muscle this week vs target. lib: the exercise library, for lifts
  // the programme does not describe (PT, old bonus sessions).
  function tally(prog, rows, lib) {
    var credit = {};
    function add(m, n) { credit[m] = (credit[m] || 0) + n; }
    var libBy = {};
    (lib || []).forEach(function (l) { libBy[key(l.name)] = l; });
    var progBy = {};
    Object.keys(prog.exercises).forEach(function (n) { progBy[key(n)] = prog.exercises[n]; });

    (rows || []).forEach(function (r) {
      var n = Number(r.sets) || 0;
      if (!n) return;
      var p = progBy[key(r.exercise)];
      if (p) {
        (p.direct || []).forEach(function (m) { add(m, n); });
        (p.indirect || []).forEach(function (m) { add(m, n * 0.5); });
        return;
      }
      var l = libBy[key(r.exercise)];
      var m = l && prog.libraryMuscle[l.muscle];
      if (m) add(m, n);
    });

    return prog.targets.map(function (t) {
      var sets = credit[t.muscle] || 0;
      var status = t.min == null ? "untargeted"
                 : sets > t.max ? "over"
                 : sets >= t.min ? "on"
                 : "under";
      return { muscle: t.muscle, sets: sets, min: t.min, max: t.max, approx: !!t.approx, status: status };
    });
  }

  // Order the pool's exercises by how far their muscles are from target.
  // Score = for each muscle the lift works, its credit (1 direct, 0.5
  // indirect) × the sets still needed to reach the TOP of that muscle's weekly
  // range (never below zero; untargeted muscles score nothing), summed.
  // Highest first; a tie keeps the pool's own order (oldest day first).
  // `rows` is the week's logged sets the tally is worked out from.
  function rankPool(prog, exercises, rows, lib) {
    var left = {};
    tally(prog, rows, lib).forEach(function (t) {
      left[t.muscle] = t.max == null ? 0 : Math.max(0, t.max - t.sets);
    });
    function score(name) {
      var e = prog.exercises[name] || {}, s = 0;
      (e.direct || []).forEach(function (m) { s += 1 * (left[m] || 0); });
      (e.indirect || []).forEach(function (m) { s += 0.5 * (left[m] || 0); });
      return s;
    }
    return exercises
      .map(function (x, i) { return { x: x, i: i, s: score(x.exercise) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; })
      .map(function (o) { return o.x; });
  }

  // A programme day (or bonus) as the page renders it: blocks of exercise
  // entries carrying everything a card needs.
  function expand(prog, blocks) {
    var flat = [];
    var out = (blocks || []).map(function (b, bi) {
      var superset = b.length > 1;
      return {
        superset: superset,
        exercises: b.map(function (s) {
          var e = prog.exercises[s.ex] || {};
          var item = {
            name: s.ex, sets: s.sets, reps: s.reps, kit: s.kit || null,
            rest: superset ? prog.supersetRest : (e.rest != null ? e.rest : 75),
            step: e.step || null, band: !!e.band, side: !!e.side,
            cues: (e.cues || []).map(function (c) { return prog.cues[c]; }).filter(Boolean)
                    .concat(e.note ? [e.note] : []),
            block: bi, index: flat.length
          };
          flat.push(item);
          return item;
        })
      };
    });
    return { blocks: out, exercises: flat };
  }

  var api = {
    todayIn: todayIn, weekDates: weekDates, mergeRows: mergeRows,
    computePool: computePool, tally: tally, rankPool: rankPool, isPoolDay: isPoolDay, expand: expand, plannedFor: plannedFor
  };
  root.IronWeek = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
