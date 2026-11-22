(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("vitals");
  HMS.layout.render({ page: "vitals", title: "Patient Queue & Vitals", crumb: "Nursing" });
  if (!HMS.auth.can("vitals")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, O = HMS.opd;
  const TABS = [["waiting", "Waiting for vitals", (v) => v.status === "registered"], ["done", "Vitals done", (v) => ["vitals_done", "in_consultation"].includes(v.status)], ["all", "All today", (v) => v.status !== "cancelled"]];
  let tab = "waiting", selId = null;

  function today(fn) { const t = HMS.todayISO(); return S.filter("visits", (v) => v.date === t && fn(v)).sort((a, b) => (a.priority === "normal") - (b.priority === "normal") || a.token - b.token); }

  function renderQueue() {
    $("#tabs").innerHTML = TABS.map((t) => '<li class="nav-item"><a class="nav-link' + (t[0] === tab ? " active" : "") + '" href="#" data-tab="' + t[0] + '">' + t[1] + ' <span class="badge text-bg-light">' + today(t[2]).length + "</span></a></li>").join("");
    const list = today(TABS.find((t) => t[0] === tab)[2]);
    $("#queue").innerHTML = list.length ? list.map((v) => { const b = O.ben(v);
      return '<tr class="clickable' + (v.id === selId ? " selected" : "") + '" data-id="' + v.id + '"><td><b style="font-size:15px">' + v.token + "</b>" + (v.priority !== "normal" ? ' <span class="chip chip-red">' + h(v.priority) + "</span>" : "") +
        "</td><td><b>" + h(b.name) + '</b><div class="small text-muted">' + HMS.age(b.dob) + " Y · " + h(b.relation) + " · " + h(v.empCode) + '</div></td><td class="small">' + h(O.doctorName(v.doctor)) + "</td><td>" + O.visitChip(v) + "</td></tr>"; }).join("")
      : '<tr><td colspan="4" class="empty"><i class="bi bi-cup-hot"></i>No patients here</td></tr>';
  }

  function renderDetail() {
    const v = selId && O.visit(selId);
    if (!v) { $("#detail").innerHTML = '<div class="card"><div class="empty"><i class="bi bi-hand-index"></i>Select a patient from the queue</div></div>'; return; }
    const b = O.ben(v), x = v.vitals || {};
    const val = (k) => (x[k] === null || x[k] === undefined ? "" : x[k]);
    const field = (id, label, unit, attrs) => '<div class="col-6 col-md-3"><label class="form-label" for="' + id + '">' + label + '</label><div class="input-group"><input class="form-control" id="' + id + '" type="number" ' + (attrs || "") +
      ' value="' + h(val(id)) + '">' + (unit ? '<span class="input-group-text">' + unit + "</span>" : "") + "</div></div>";
    const closed = ["completed", "cancelled"].includes(v.status);
    $("#detail").innerHTML =
      '<div class="card mb-3"><div class="card-body d-flex gap-3 align-items-center flex-wrap"><div class="avatar" style="width:46px;height:46px">' + h(HMS.initials(b.name)) + '</div><div><div style="font-size:16px;font-weight:700">' + h(b.name) +
      ' <span class="text-muted fw-normal" style="font-size:13px">· ' + HMS.age(b.dob) + " Y / " + h(b.gender) + " · Token " + v.token + '</span></div><div class="text-muted small">' + h(b.relation) + " of " + h(v.empCode) + " · " + h(v.visitNo) + " · for " + h(O.doctorName(v.doctor)) +
      '</div></div><div class="ms-auto">' + O.visitChip(v) + "</div></div>" + (v.complaint ? '<div class="card-body border-top py-2"><b>Complaint:</b> ' + h(v.complaint) + "</div>" : "") + "</div>" +
      '<form class="card" id="vitForm" novalidate><div class="card-header"><h3>Vitals</h3><span class="sub">Out-of-range values are highlighted</span></div><div class="card-body"><div class="row g-3">' +
      '<div class="col-12 col-md-6"><label class="form-label req">Blood pressure</label><div class="input-group"><input class="form-control" id="bpSys" type="number" placeholder="Systolic" value="' + h(val("bpSys")) + '" aria-label="Systolic"><span class="input-group-text">/</span><input class="form-control" id="bpDia" type="number" placeholder="Diastolic" value="' + h(val("bpDia")) + '" aria-label="Diastolic"><span class="input-group-text">mmHg</span></div></div>' +
      field("pulse", "Pulse", "bpm") + field("temp", "Temperature", "°F", 'step="0.1"') + field("spo2", "SpO₂", "%") + field("weight", "Weight", "kg", 'step="0.1"') + field("height", "Height", "cm") +
      '<div class="col-6 col-md-3"><label class="form-label">BMI</label><div class="form-control bg-light" id="bmi">–</div></div>' + field("sugar", "Random sugar", "mg/dL") +
      '<div class="col-md-6"><label class="form-label" for="allergies">Known allergies</label><input class="form-control" id="allergies" value="' + h(b.allergies || "") + '" placeholder="None known"><div class="form-text">Shown to doctor and pharmacist</div></div>' +
      '<div class="col-md-6"><label class="form-label">Triage</label><div class="d-flex gap-2">' + ["normal", "urgent", "emergency"].map((t) => '<input class="btn-check" type="radio" name="triage" id="tr_' + t + '" value="' + t + '"' + ((x.triage || (v.priority === "normal" ? "normal" : v.priority)) === t ? " checked" : "") +
        '><label class="btn btn-sm btn-outline-' + (t === "normal" ? "secondary" : t === "urgent" ? "warning" : "danger") + '" for="tr_' + t + '">' + t[0].toUpperCase() + t.slice(1) + "</label>").join("") + "</div></div>" +
      '<div class="col-12"><label class="form-label" for="notes">Nursing notes</label><textarea class="form-control" id="notes" rows="2">' + h(x.notes || "") + "</textarea></div>" +
      '</div><div id="alerts" class="mt-3"></div></div><div class="card-body border-top d-flex justify-content-end gap-2">' +
      (closed ? '<span class="text-muted">This visit is closed.</span>' : '<button class="btn btn-primary" type="submit"><i class="bi bi-send me-1"></i>Save &amp; send to doctor</button>') + "</div></form>";
    const live = () => {
      const g = (id) => { const n = parseFloat($("#" + id).value); return isNaN(n) ? null : n; };
      const w = g("weight"), ht = g("height");
      $("#bmi").textContent = w && ht ? (w / Math.pow(ht / 100, 2)).toFixed(1) : "–";
      const al = [];
      const mark = (id, bad, msg) => { $("#" + id).classList.toggle("is-invalid", !!bad); if (bad) al.push(msg); };
      mark("bpSys", g("bpSys") !== null && (g("bpSys") >= 140 || g("bpSys") < 90), "Blood pressure out of normal range");
      mark("bpDia", g("bpDia") !== null && (g("bpDia") >= 90 || g("bpDia") < 60), "");
      mark("temp", g("temp") !== null && g("temp") >= 99.5, "Fever");
      mark("spo2", g("spo2") !== null && g("spo2") < 95, "Low oxygen saturation");
      mark("pulse", g("pulse") !== null && (g("pulse") > 100 || g("pulse") < 55), "Pulse out of normal range");
      mark("sugar", g("sugar") !== null && g("sugar") > 200, "High blood sugar");
      $("#alerts").innerHTML = al.filter(Boolean).length ? '<div class="note note-warn"><i class="bi bi-exclamation-triangle"></i><div>' + al.filter(Boolean).map(h).join(" · ") + "</div></div>" : "";
    };
    $("#vitForm").addEventListener("input", live); live();
    $("#vitForm").onsubmit = (e) => {
      e.preventDefault();
      const g = (id) => $("#" + id).value;
      try {
        O.saveVitals(v.id, { bpSys: g("bpSys"), bpDia: g("bpDia"), pulse: g("pulse"), temp: g("temp"), spo2: g("spo2"), weight: g("weight"), height: g("height"), sugar: g("sugar"),
          triage: (document.querySelector("input[name=triage]:checked") || {}).value, notes: g("notes"), allergies: g("allergies") });
        HMS.toast("Vitals saved – token " + v.token + " sent to " + O.doctorName(v.doctor));
        const next = today(TABS[0][2])[0];
        selId = next ? next.id : null; renderQueue(); renderDetail();
      } catch (err) { HMS.toast(err.message, "danger"); }
    };
  }

  $("#tabs").onclick = (e) => { const a = e.target.closest("[data-tab]"); if (!a) return; e.preventDefault(); tab = a.dataset.tab; renderQueue(); };
  $("#queue").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (!tr) return; selId = Number(tr.dataset.id); renderQueue(); renderDetail(); };
  const first = today(TABS[0][2])[0]; selId = Number(HMS.param("visit")) || (first && first.id) || null;
  renderQueue(); renderDetail();
  setInterval(() => { if (!document.querySelector("#vitForm:focus-within")) renderQueue(); }, 20000);
})();
