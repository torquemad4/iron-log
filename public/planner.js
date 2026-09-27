// The Planner tab. Sophie builds the week here: every day has a morning slot
// and a bonus slot, each a list of exercises from the library. A slot reaches
// the Log tab only once it is LOCKED; until then it is a draft.
//
// Unlike logging, planning is not offline-first. It happens at a desk, not at
// the rack, and a plan that only exists on one phone is not a plan anyone else
// can see. Every change goes straight to D1 and the screen shows what D1 said.

(function(){
  "use strict";

  var DAYS = [["mon","Monday"],["tue","Tuesday"],["wed","Wednesday"],["thu","Thursday"],
              ["fri","Friday"],["sat","Saturday"],["sun","Sunday"]];
  var SLOT_LABEL = { morning: "Morning", bonus: "Bonus" };

  var L = window.IronLog;
  var esc = L.esc, fmtW = L.fmtW;
  var maxesInfo = null;       // { rows, last } from /api/rep-maxes
  var editing = null;         // { day, slot, exercises: [...], locked, ... } — a working copy

  // ---------- tabs ----------
  function showTab(t){
    document.querySelectorAll("#tabs button").forEach(function(b){
      b.classList.toggle("sel", b.dataset.tab === t);
    });
    document.getElementById("logView").hidden = t !== "log";
    document.getElementById("plannerView").hidden = t !== "planner";
    if (t === "planner") { renderPlanner(); load(); }
    // So Sophie can bookmark the planner and land on it directly.
    try { history.replaceState(null, "", t === "planner" ? "#planner" : location.pathname); } catch (e) {}
  }
  document.querySelectorAll("#tabs button").forEach(function(b){
    b.onclick = function(){ showTab(b.dataset.tab); };
  });

  function load(){
    L.refreshPlan().then(renderPlanner);
    fetch("/api/rep-maxes").then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
      if (j && j.imported) { maxesInfo = j.imported; renderPlanner(); }
    }).catch(function(){});
  }

  // ---------- api ----------
  function api(method, url, body){
    return fetch(url, { method: method, headers: {"content-type":"application/json"}, body: JSON.stringify(body) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
        if (!r.ok) throw new Error(j.error || ("The server said " + r.status));
        return j;
      }); });
  }
  function saveSlot(body){
    return api("PUT", "/api/plan", body).then(function(j){
      var slots = L.state.plan.map(function(s){
        return (s.day === j.slot.day && s.slot === j.slot.slot) ? j.slot : s;
      });
      if (!slots.some(function(s){ return s.day === j.slot.day && s.slot === j.slot.slot; })) slots.push(j.slot);
      L.setPlan(slots);
      renderPlanner();
      return j.slot;
    });
  }

  function slotOf(day, slot){
    var p = L.state.plan.filter(function(s){ return s.day === day && s.slot === slot; })[0];
    return p || { day: day, slot: slot, exercises: [], locked: false };
  }
  function lib(name){
    var n = String(name).toLowerCase();
    return L.state.lib.filter(function(x){ return x.name.toLowerCase() === n; })[0] || null;
  }
  function unit(name){ var l = lib(name); return l && l.kind === "banded" ? " band" : " kg"; }
  function rx(x){
    return x.sets + "×" + esc(x.reps) + (x.weight != null ? " @ " + fmtW(x.weight) + unit(x.name) : "");
  }
  function when(iso){
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }
  function person(email){ return email && email !== "local" ? String(email).split("@")[0] : ""; }

  // ---------- the week ----------
  function renderPlanner(){
    var v = document.getElementById("plannerView");
    if (v.hidden) return;
    var h = "";

    if (maxesInfo && !maxesInfo.rows) {
      // Trainerize has no export for workout history (its CSV export is contact
      // details only), so the route in is screenshots or the template, via Karl.
      h += '<div class="card outstanding"><b>No Trainerize rep maxes imported yet.</b> ' +
           'Trainerize cannot export them, so: screenshot each lift&rsquo;s history in Trainerize ' +
           '(or fill in <a href="rep-maxes-template.csv" download style="color:var(--accent)">this template</a>) ' +
           'and send it to Karl. Anything logged here already counts.</div>';
    }

    h += '<p class="note">Tap a slot to set its exercises, then lock it. Only locked slots appear in the Log. ' +
         'A day with nothing locked keeps the current programme.</p>';

    DAYS.forEach(function(d){
      h += '<div class="card pday"><h2>' + d[1] + '</h2><div class="slots">' +
           ["morning","bonus"].map(function(sl){ return slotTile(slotOf(d[0], sl)); }).join("") +
           '</div></div>';
    });

    h += '<div class="card lib"><div class="cardhead"><h2>Exercise library</h2>' +
         '<button class="smallbtn" id="libAdd">+ New exercise</button></div>' +
         '<p class="note">Tap one for its rep-max history.</p>' +
         (L.state.lib.length ? L.state.lib.map(function(x){
           return '<button class="li" data-rm="' + esc(x.name) + '"><span>' + esc(x.name) +
                  '<span class="tag">' + (x.kind === "banded" ? "band" : "weight") + '</span></span>' +
                  '<small>' + x.sets + '×' + esc(x.reps) + (x.weight != null ? ' @ ' + fmtW(x.weight) + (x.kind === "banded" ? " band" : " kg") : '') + '</small></button>';
         }).join("") : '<div class="empty">Loading the library…</div>') +
         '</div>';

    v.innerHTML = h;
    v.querySelectorAll("[data-slot]").forEach(function(b){
      b.onclick = function(){ var p = b.dataset.slot.split("|"); openSlot(p[0], p[1]); };
    });
    v.querySelectorAll("[data-rm]").forEach(function(b){ b.onclick = function(){ showMaxes(b.dataset.rm); }; });
    document.getElementById("libAdd").onclick = function(){ openNewExercise(null); };
  }

  function slotTile(s){
    var state = s.locked ? '<span class="lk">🔒 Locked</span>'
              : (s.exercises.length ? '<span class="dr">Draft</span>' : '<span>Empty</span>');
    return '<button class="slot' + (s.locked ? ' locked' : '') + '" data-slot="' + s.day + '|' + s.slot + '">' +
             '<div class="st"><span>' + SLOT_LABEL[s.slot] + '</span>' + state + '</div>' +
             (s.exercises.length
               ? '<ul>' + s.exercises.map(function(x){ return '<li>' + esc(x.name) + ' · ' + rx(x) + '</li>'; }).join("") + '</ul>'
               : '<div class="none">Nothing set</div>') +
           '</button>';
  }

  // ---------- one slot ----------
  function openSlot(day, slot){
    var s = slotOf(day, slot);
    editing = JSON.parse(JSON.stringify(s));
    var dn = DAYS.filter(function(d){ return d[0] === day; })[0][1];
    document.getElementById("slotTitle").textContent = dn + " · " + SLOT_LABEL[slot];
    paintSlot();
    document.getElementById("slotDlg").showModal();
  }

  function paintSlot(){
    var body = document.getElementById("slotBody"), acts = document.getElementById("slotActs");
    var s = editing;

    if (s.locked) {
      body.innerHTML =
        '<p class="lockinfo">🔒 Locked' + (person(s.locked_by) ? ' by ' + esc(person(s.locked_by)) : '') +
          (s.locked_at ? ' on ' + esc(when(s.locked_at)) : '') + '. This is what the Log shows.</p>' +
        '<ul class="ro" style="margin:0;padding-left:18px">' +
          s.exercises.map(function(x){ return '<li><b>' + esc(x.name) + '</b> — ' + rx(x) + '</li>'; }).join("") +
        '</ul>';
      acts.innerHTML = '<button id="slClose">Close</button><button id="slUnlock">Unlock to edit</button>';
      document.getElementById("slClose").onclick = closeSlot;
      document.getElementById("slUnlock").onclick = function(){
        if (!confirm("Unlock this slot? It drops out of the Log until it is locked again.")) return;
        busy(this, "Unlocking…");
        saveSlot({ day: s.day, slot: s.slot, locked: false }).then(function(fresh){
          editing = JSON.parse(JSON.stringify(fresh)); paintSlot();
        }).catch(fail);
      };
      return;
    }

    var used = {};
    s.exercises.forEach(function(x){ used[x.name.toLowerCase()] = 1; });
    var options = L.state.lib.filter(function(x){ return !used[x.name.toLowerCase()]; });

    body.innerHTML =
      '<div class="srows">' +
        (s.exercises.length ? s.exercises.map(function(x, i){
          var banded = (lib(x.name) || {}).kind === "banded";
          return '<div class="srow2">' +
            '<div class="nm"><span>' + esc(x.name) + '<span class="tag">' + (banded ? "band" : "weight") + '</span></span>' +
              '<span class="mv">' +
                '<button data-mv="' + i + '|-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
                '<button data-mv="' + i + '|1" aria-label="Move down"' + (i === s.exercises.length - 1 ? ' disabled' : '') + '>↓</button>' +
                '<button data-rmv="' + i + '" aria-label="Remove">✕</button>' +
              '</span></div>' +
            '<div class="f3">' +
              '<div><label>Sets</label><input data-fx="' + i + '|sets" type="number" inputmode="numeric" min="1" max="12" value="' + x.sets + '"></div>' +
              '<div><label>Reps</label><input data-fx="' + i + '|reps" type="text" value="' + esc(x.reps) + '"></div>' +
              '<div><label>' + (banded ? "Band level" : "Suggested kg") + '</label><input data-fx="' + i + '|weight" type="number" inputmode="decimal" step="0.5" min="0" placeholder="—" value="' + (x.weight != null ? fmtW(x.weight) : "") + '"></div>' +
            '</div></div>';
        }).join("") : '<div class="empty" style="padding:10px 0">No exercises yet. Add one below.</div>') +
      '</div>' +
      '<div class="addrow">' +
        '<select id="slPick" aria-label="Exercise from the library">' +
          '<option value="">Add from library…</option>' +
          options.map(function(x){ return '<option value="' + esc(x.name) + '">' + esc(x.name) + '</option>'; }).join("") +
        '</select>' +
        '<button id="slNew">New…</button>' +
      '</div>';

    acts.innerHTML = '<button id="slCancel">Cancel</button><button id="slSave">Save draft</button>' +
                     '<button id="slLock" class="primary">Lock</button>';

    body.querySelectorAll("[data-fx]").forEach(function(inp){
      inp.oninput = function(){
        var p = inp.dataset.fx.split("|"), x = s.exercises[+p[0]];
        if (p[1] === "sets") x.sets = parseInt(inp.value, 10) || 1;
        else if (p[1] === "reps") x.reps = inp.value;
        else x.weight = inp.value === "" ? null : parseFloat(inp.value);
      };
    });
    body.querySelectorAll("[data-mv]").forEach(function(b){
      b.onclick = function(){
        var p = b.dataset.mv.split("|"), i = +p[0], j = i + (+p[1]);
        var t = s.exercises[i]; s.exercises[i] = s.exercises[j]; s.exercises[j] = t;
        paintSlot();
      };
    });
    body.querySelectorAll("[data-rmv]").forEach(function(b){
      b.onclick = function(){ s.exercises.splice(+b.dataset.rmv, 1); paintSlot(); };
    });
    document.getElementById("slPick").onchange = function(){
      if (this.value) addToSlot(lib(this.value));
    };
    document.getElementById("slNew").onclick = function(){ openNewExercise(addToSlot); };
    document.getElementById("slCancel").onclick = closeSlot;
    document.getElementById("slSave").onclick = function(){ commit(this, false); };
    document.getElementById("slLock").onclick = function(){ commit(this, true); };
  }

  function addToSlot(x){
    if (!x || !editing) return;
    if (editing.exercises.some(function(e){ return e.name.toLowerCase() === x.name.toLowerCase(); })) return;
    editing.exercises.push({ name: x.name, sets: x.sets, reps: x.reps, weight: x.weight != null ? x.weight : null });
    paintSlot();
  }

  function commit(btn, lock){
    var s = editing;
    if (lock && !s.exercises.length) { alert("Add at least one exercise before locking."); return; }
    if (s.exercises.some(function(x){ return !String(x.reps).trim(); })) { alert("Every exercise needs a rep target."); return; }
    busy(btn, lock ? "Locking…" : "Saving…");
    saveSlot({ day: s.day, slot: s.slot, exercises: s.exercises, locked: lock })
      .then(function(){ closeSlot(); })
      .catch(fail);
  }

  function closeSlot(){ editing = null; document.getElementById("slotDlg").close(); }
  function busy(btn, text){ btn.disabled = true; btn.dataset.was = btn.textContent; btn.textContent = text; }
  function fail(e){
    alert("That did not save: " + (e && e.message || e) + "\n\nNothing was changed.");
    // Repaint from the working copy so the buttons come back.
    if (editing) paintSlot();
  }

  // ---------- adding to the library ----------
  var afterNew = null;
  function openNewExercise(then){
    afterNew = then;
    ["exName","exWeight"].forEach(function(id){ document.getElementById(id).value = ""; });
    document.getElementById("exKind").value = "weighted";
    document.getElementById("exSets").value = 3;
    document.getElementById("exReps").value = "8-12";
    document.getElementById("exRest").value = 75;
    document.getElementById("exSide").checked = false;
    document.getElementById("exErr").hidden = true;
    kindLabel();
    document.getElementById("exDlg").showModal();
    document.getElementById("exName").focus();
  }
  function kindLabel(){
    document.getElementById("exWLab").textContent =
      document.getElementById("exKind").value === "banded" ? "Suggested band level" : "Suggested kg";
  }
  document.getElementById("exKind").onchange = kindLabel;
  document.getElementById("exCancel").onclick = function(){ document.getElementById("exDlg").close(); };
  document.getElementById("exSave").onclick = function(){
    var btn = this, err = document.getElementById("exErr");
    var name = document.getElementById("exName").value.trim();
    if (!name) { err.textContent = "Give it a name."; err.hidden = false; return; }
    if (lib(name) && !confirm(name + " is already in the library. Replace its defaults with these?")) return;
    btn.disabled = true;
    api("POST", "/api/exercises", {
      name: name,
      kind: document.getElementById("exKind").value,
      sets: document.getElementById("exSets").value,
      reps: document.getElementById("exReps").value,
      weight: document.getElementById("exWeight").value,
      rest: document.getElementById("exRest").value,
      side: document.getElementById("exSide").checked
    }).then(function(j){
      var list = L.state.lib.filter(function(x){ return x.name.toLowerCase() !== j.exercise.name.toLowerCase(); });
      list.push(j.exercise);
      list.sort(function(a, b){ return a.name.localeCompare(b.name); });
      L.setLib(list);
      document.getElementById("exDlg").close();
      renderPlanner();
      if (afterNew) afterNew(j.exercise);
    }).catch(function(e){
      err.textContent = "Not saved: " + (e && e.message || e); err.hidden = false;
    }).then(function(){ btn.disabled = false; });
  };

  // ---------- rep maxes ----------
  function showMaxes(name){
    var dlg = document.getElementById("rmDlg"), body = document.getElementById("rmBody");
    document.getElementById("rmTitle").textContent = name + " — rep maxes";
    body.innerHTML = '<div class="empty">Loading…</div>';
    dlg.showModal();
    var banded = (lib(name) || {}).kind === "banded";
    fetch("/api/rep-maxes?ex=" + encodeURIComponent(name)).then(function(r){ return r.json(); }).then(function(j){
      var ex = (j.exercises || [])[0];
      if (!ex || !ex.maxes.length) {
        body.innerHTML = '<div class="empty">No record yet — from Trainerize or from here.</div>';
        return;
      }
      body.innerHTML =
        '<table><thead><tr><th>Reps</th><th>Best</th><th>When</th></tr></thead><tbody>' +
        ex.maxes.map(function(m){
          // The progression, oldest first, when there is more than one date.
          var trail = m.history.length > 1
            ? '<div class="hist">' + m.history.map(function(h){ return fmtW(h.weight) + ' (' + esc(shortDate(h.date)) + ')'; }).join(" → ") + '</div>'
            : '';
          return '<tr><td>' + m.reps + '</td>' +
                 '<td><b>' + fmtW(m.best.weight) + (banded ? ' band' : ' kg') + '</b>' + trail + '</td>' +
                 '<td>' + esc(shortDate(m.best.date)) + '<div class="hist">' + (m.best.source === "ironlog" ? "Iron Log" : "Trainerize") + '</div></td></tr>';
        }).join("") +
        '</tbody></table>';
    }).catch(function(){
      body.innerHTML = '<div class="empty">Offline — rep maxes live on the server.</div>';
    });
  }
  function shortDate(iso){
    var d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString([], { day: "numeric", month: "short", year: "2-digit" });
  }
  document.getElementById("rmClose").onclick = function(){ document.getElementById("rmDlg").close(); };

  window.IronPlanner = { showMaxes: showMaxes };

  if (location.hash === "#planner") showTab("planner");
})();
