(function () {
  "use strict";
  const { h, $ } = HMS;
  const me = HMS.auth.require("consult");
  HMS.layout.render({ page: "consult", title: "Consultation", crumb: "Doctor" });
  if (!HMS.auth.can("consult")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, O = HMS.opd;
  const DIAGNOSES = ["Viral fever", "Acute febrile illness", "Upper respiratory infection", "Acute gastroenteritis", "Gastritis", "Hypertension", "Hypertension – follow-up",
    "Type 2 diabetes mellitus", "Type 2 diabetes – follow-up", "Dyslipidaemia", "Allergic rhinitis", "Low back pain", "Knee pain", "Myalgia", "Headache", "Urinary tract infection",
    "Bronchial asthma", "Anaemia", "Hypothyroidism", "Dental caries", "Routine check-up"];
  const DOSAGE = { "1-0-1": 2, "1-1-1": 3, "1-0-0": 1, "0-0-1": 1, "0-1-0": 1, "1-1-1-1": 4, "SOS": 1, "Once": 1 };
  let doctor = me.role === "doctor" ? me.username : (O.doctors()[0] || {}).username;

  // ---------- queue ----------
  function renderQueue() {
    const t = HMS.todayISO();
    if (me.role !== "doctor") {
      $("#docPick").hidden = false;
      $("#docPick").innerHTML = O.doctors().map((u) => '<option value="' + h(u.username) + '"' + (u.username === doctor ? " selected" : "") + ">" + h(u.name) + " · " + h(u.department) + "</option>").join("");
    }
    $("#docName").textContent = O.doctorName(doctor);
    const mine = S.filter("visits", (v) => v.date === t && v.doctor === doctor);
    const open = mine.filter((v) => ["registered", "vitals_done", "in_consultation"].includes(v.status)).sort((a, b) => (a.priority === "normal") - (b.priority === "normal") || a.token - b.token);
    $("#queue").innerHTML = open.length ? open.map((v) => { const b = O.ben(v), x = v.vitals;
      return '<tr><td><b style="font-size:16px">' + v.token + "</b>" + (v.priority !== "normal" ? ' <span class="chip chip-red">' + h(v.priority) + "</span>" : "") + "</td><td><b>" + h(b.name) + '</b><div class="small text-muted">' + HMS.age(b.dob) + " Y / " + h((b.gender || "")[0]) + " · " + h(b.relation) + " · " + h(v.empCode) +
        '</div></td><td class="small">' + h(v.complaint || "—") + '</td><td class="small">' + (x ? "BP " + x.bpSys + "/" + x.bpDia + " · " + x.temp + "°F" : '<span class="text-muted">Not taken</span>') + "</td><td>" + O.visitChip(v) +
        '</td><td class="text-end"><a class="btn btn-sm btn-primary" href="consult.html?visit=' + v.id + '">' + (v.status === "in_consultation" ? "Continue" : "Start") + "</a></td></tr>"; }).join("")
      : '<tr><td colspan="6" class="empty"><i class="bi bi-cup-hot"></i>No patients waiting</td></tr>';
    const seen = mine.filter((v) => v.status === "completed").sort((a, b) => b.consult.completedAt.localeCompare(a.consult.completedAt));
    $("#seen").innerHTML = seen.length ? seen.map((v) => { const b = O.ben(v); return '<tr><td class="text-muted">' + h(HMS.fmtTime(v.consult.completedAt)) + "</td><td><b>" + h(b.name) + '</b><div class="small text-muted">' + h(v.consult.diagnosis.join(", ")) +
      '</div></td><td class="text-end"><button class="btn btn-sm btn-light border" data-print="' + v.id + '" title="Print vouchers"><i class="bi bi-printer"></i></button></td></tr>'; }).join("")
      : '<tr><td class="text-muted text-center py-3">None yet</td></tr>';
  }
  $("#docPick").onchange = (e) => { doctor = e.target.value; renderQueue(); };
  $("#seen").onclick = (e) => { const bt = e.target.closest("[data-print]"); if (bt) showVouchers(Number(bt.dataset.print), true); };

  // ---------- consultation ----------
  function openConsult(id) {
    const v = O.visit(id);
    if (!v) { HMS.toast("Visit not found", "danger"); return; }
    if (me.role === "doctor" && v.doctor !== me.username) HMS.toast("This patient is in " + O.doctorName(v.doctor) + "'s queue", "warning");
    O.startConsult(id);
    const b = O.ben(v), x = v.vitals, e = HMS.svc.employee(v.empCode) || {};
    const closed = v.status === "completed" || v.status === "cancelled";
    const hist = O.history(b.id, v.id);
    const lastLab = hist.flatMap((hh) => hh.labs.filter((o) => o.status === "released")).slice(0, 2);
    const vit = (l, val, warn) => '<div><div class="small text-muted">' + l + '</div><b' + (warn ? ' style="color:var(--amber)"' : "") + ">" + (val ?? "–") + "</b></div>";
    $("#queueView").hidden = true; $("#consultView").hidden = false;
    $("#consultView").innerHTML =
      '<div class="card mb-3"><div class="card-body d-flex flex-wrap gap-3 align-items-center">' +
      (b.photo ? '<img src="' + b.photo + '" alt="" style="width:46px;height:54px;border-radius:8px;object-fit:cover">' : '<div class="avatar" style="width:48px;height:48px;font-size:15px">' + h(HMS.initials(b.name)) + "</div>") +
      '<div><div style="font-size:16.5px;font-weight:700">' + h(b.name) + '</div><div class="text-muted small">' + HMS.age(b.dob) + " Y / " + h(b.gender) + " · " + h(b.relation) + " of " + h(e.name) + ' (<span class="mono">' + h(v.empCode) + "</span>) · " + h(v.visitNo) + " · Token " + v.token + "</div></div>" +
      '<div class="d-flex gap-4 ms-xl-4 ps-xl-4 border-start flex-wrap">' + (x ? vit("BP", x.bpSys + "/" + x.bpDia, x.bpSys >= 140 || x.bpDia >= 90) + vit("Temp", x.temp + "°F", x.temp >= 99.5) + vit("Pulse", x.pulse, x.pulse > 100) + vit("SpO₂", x.spo2 != null ? x.spo2 + "%" : null, x.spo2 != null && x.spo2 < 95) + vit("BMI", O.bmi(x)) + (x.sugar ? vit("RBS", x.sugar, x.sugar > 200) : "") : '<span class="text-muted small">Vitals not recorded</span>') + "</div>" +
      '<div class="ms-auto d-flex gap-2 align-items-center">' + (b.allergies ? '<span class="chip chip-red" style="padding:6px 12px"><i class="bi bi-exclamation-triangle"></i> Allergy: ' + h(b.allergies) + "</span>" : '<span class="chip chip-grey">No known allergies</span>') +
      '<a class="btn btn-light border btn-sm" href="consult.html">Back to queue</a></div></div></div>' +
      '<div class="row g-3"><div class="col-xl-3"><div class="card"><div class="card-header"><h3>History</h3><span class="sub">' + hist.length + " visits</span></div><div class=\"card-body\" style=\"max-height:62vh;overflow:auto\">" +
      (hist.length ? hist.slice(0, 10).map((hh) => '<div class="pb-2 mb-2 border-bottom"><b>' + h(HMS.fmtDate(hh.v.date)) + "</b> · " + h(hh.v.consult.diagnosis.join(", ")) + '<div class="small text-muted">' + h(O.doctorName(hh.v.doctor)) + "</div>" +
        (hh.rx.length ? '<div class="small">' + hh.rx.map((r) => h(O.drug(r.drugId).name)).join(", ") + "</div>" : "") + "</div>").join("") : '<div class="text-muted">First visit</div>') +
      (lastLab.length ? '<div class="fw-semibold mt-2">Last lab results</div>' + lastLab.map((o) => o.items.map((it) => { const t = O.test(it.testId); return t.params.map((p, k) => '<div class="small">' + h(p.n) + ": <b class=\"flag-" + it.flags[k] + '">' + h(it.values[k]) + "</b> " + h(p.u) + " " + (it.flags[k] && it.flags[k] !== "N" ? '<span class="chip chip-red">' + it.flags[k] + "</span>" : "") + "</div>").join(""); }).join("") + '<div class="small text-muted mb-2">' + h(HMS.fmtDate(o.releasedAt.slice(0, 10))) + "</div>").join("") : "") +
      "</div></div></div>" +
      '<div class="col-xl-9"><form class="card" id="cForm" novalidate>' +
      '<div class="card-body border-bottom"><div class="row g-3"><div class="col-md-6"><label class="form-label">Chief complaint</label><div class="form-control bg-light">' + h(v.complaint || "—") + "</div></div>" +
      '<div class="col-md-6"><label class="form-label req" for="dxInput">Diagnosis</label><div class="input-group"><input class="form-control" id="dxInput" list="dxList" placeholder="Type and press Enter"><button class="btn btn-light border" type="button" id="dxAdd">Add</button></div>' +
      '<datalist id="dxList">' + DIAGNOSES.map((d) => "<option>" + h(d) + "</option>").join("") + '</datalist><div id="dxTags" class="mt-2 d-flex flex-wrap gap-1"></div></div>' +
      '<div class="col-12"><label class="form-label" for="notes">Clinical notes</label><textarea class="form-control" id="notes" rows="2" placeholder="Examination findings, advice"></textarea></div></div></div>' +
      '<div class="card-header"><h3>Prescription</h3><span class="sub">Stock shown live from the hospital pharmacy</span></div>' +
      '<div class="card-body border-bottom"><div class="input-group mb-2" style="max-width:520px"><span class="input-group-text bg-white"><i class="bi bi-capsule"></i></span><input class="form-control" id="drugInput" list="drugList" placeholder="Type medicine name and press Enter">' +
      '<button class="btn btn-light border" type="button" id="drugAdd">Add</button></div><datalist id="drugList">' + S.all("drugs").filter((d) => d.active).map((d) => '<option value="' + h(d.name) + '">' + O.stock(d.id) + " in stock</option>").join("") + "</datalist>" +
      '<div id="allergyWarn"></div><div class="table-responsive"><table class="table table-sm rx-table"><thead><tr><th>Medicine</th><th>Dosage</th><th>Days</th><th>Qty</th><th>Instruction</th><th>Stock</th><th></th></tr></thead><tbody id="rxBody"></tbody></table></div></div>' +
      '<div class="card-header"><h3>Lab tests</h3><div class="form-check form-switch ms-auto mb-0"><input class="form-check-input" type="checkbox" id="labUrgent"><label class="form-check-label small" for="labUrgent">Urgent</label></div></div>' +
      '<div class="card-body border-bottom"><div class="row g-2">' + S.all("labTests").filter((t) => t.active).map((t) => '<div class="col-sm-6 col-lg-4"><div class="form-check"><input class="form-check-input" type="checkbox" value="' + t.id + '" id="lt' + t.id + '" name="lab"><label class="form-check-label" for="lt' + t.id + '">' + h(t.name) + ' <span class="text-muted small">' + HMS.fmtMoney(t.rate) + "</span></label></div></div>").join("") + "</div></div>" +
      '<div class="card-body d-flex flex-wrap gap-2 align-items-center"><label class="form-label mb-0 me-1" for="followUp">Follow-up</label><select class="form-select form-select-sm" id="followUp" style="max-width:160px"><option value="">Not needed</option><option value="3">After 3 days</option><option value="7">After 1 week</option><option value="15">After 15 days</option><option value="30">After 1 month</option></select>' +
      '<span class="ms-auto text-muted small" id="totalHint"></span>' +
      (closed ? '<span class="chip chip-green">Consultation completed</span><button type="button" class="btn btn-primary" id="vouchBtn"><i class="bi bi-printer me-1"></i>Print vouchers</button>' : '<button class="btn btn-primary" type="submit"><i class="bi bi-check2-circle me-1"></i>Complete &amp; send to lab / pharmacy</button>') + "</div></form></div></div>";

    // diagnosis tags
    const dx = closed && v.consult ? v.consult.diagnosis.slice() : [];
    const renderDx = () => { $("#dxTags").innerHTML = dx.map((d, i) => '<span class="chip chip-blue">' + h(d) + (closed ? "" : ' <a href="#" class="text-reset" data-rmdx="' + i + '" aria-label="Remove">×</a>') + "</span>").join(""); };
    const addDx = () => { const val = HMS.clean($("#dxInput").value); if (val && !dx.includes(val)) dx.push(val); $("#dxInput").value = ""; renderDx(); };
    $("#dxInput").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addDx(); } });
    $("#dxAdd").onclick = addDx;
    $("#dxTags").onclick = (ev) => { const a = ev.target.closest("[data-rmdx]"); if (a) { ev.preventDefault(); dx.splice(Number(a.dataset.rmdx), 1); renderDx(); } };

    // prescription
    const rx = closed ? S.filter("rxItems", (r) => r.visitId === v.id).map((r) => Object.assign({}, r)) : [];
    const allergyHit = (name) => { const a = (b.allergies || "").toLowerCase().split(/[,;/]| and /).map((s) => s.trim().replace(/ drugs?$/, "")).filter((s) => s.length > 2); return a.find((w) => name.toLowerCase().includes(w)); };
    function renderRx() {
      $("#rxBody").innerHTML = rx.length ? rx.map((r, i) => { const d = O.drug(r.drugId), stock = O.stock(d.id);
        return "<tr><td><b>" + h(d.name) + '</b><div class="small text-muted">' + HMS.fmtMoney(d.rate) + " each</div></td>" +
          '<td><select class="form-select form-select-sm" data-f="dosage" data-i="' + i + '"' + (closed ? " disabled" : "") + ">" + Object.keys(DOSAGE).map((k) => "<option" + (k === r.dosage ? " selected" : "") + ">" + k + "</option>").join("") + "</select></td>" +
          '<td><input class="form-control form-control-sm" type="number" min="1" max="90" data-f="days" data-i="' + i + '" value="' + r.days + '"' + (closed ? " disabled" : "") + ' style="width:70px"></td>' +
          '<td><input class="form-control form-control-sm" type="number" min="1" data-f="qty" data-i="' + i + '" value="' + r.qty + '"' + (closed ? " disabled" : "") + ' style="width:80px"></td>' +
          '<td><select class="form-select form-select-sm" data-f="instruction" data-i="' + i + '"' + (closed ? " disabled" : "") + ">" + ["After food", "Before food", "At bedtime", "As needed", "External use"].map((k) => "<option" + (k === r.instruction ? " selected" : "") + ">" + k + "</option>").join("") + "</select></td>" +
          "<td>" + (stock >= r.qty ? '<span class="chip chip-green">' + stock + "</span>" : stock > 0 ? '<span class="chip chip-amber">Only ' + stock + "</span>" : '<span class="chip chip-red">Out of stock</span>') + "</td>" +
          "<td>" + (closed ? "" : '<button type="button" class="btn btn-sm btn-link text-danger" data-rm="' + i + '" aria-label="Remove"><i class="bi bi-trash"></i></button>') + "</td></tr>"; }).join("")
        : '<tr><td colspan="7" class="text-muted text-center py-3">No medicines added</td></tr>';
      const hits = rx.map((r) => [O.drug(r.drugId).name, allergyHit(O.drug(r.drugId).name)]).filter((x2) => x2[1]);
      $("#allergyWarn").innerHTML = hits.length ? '<div class="note note-err mb-2"><i class="bi bi-exclamation-octagon"></i><div><b>Allergy warning:</b> ' + hits.map((x2) => h(x2[0]) + " may contain " + h(x2[1])).join("; ") + "</div></div>" : "";
      updateTotal();
    }
    function addDrug() {
      const name = HMS.clean($("#drugInput").value).toLowerCase();
      const d = S.find("drugs", (y) => y.name.toLowerCase() === name) || S.filter("drugs", (y) => y.name.toLowerCase().includes(name))[0];
      if (!name || !d) return HMS.toast("Choose a medicine from the list", "warning");
      if (rx.some((r) => r.drugId === d.id)) return HMS.toast(d.name + " is already prescribed", "warning");
      rx.push({ drugId: d.id, dosage: "1-0-1", days: 3, qty: /syrup|inhaler|pen/i.test(d.name) ? 1 : 6, instruction: "After food" });
      $("#drugInput").value = ""; renderRx();
    }
    if (!closed) {
      $("#drugInput").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addDrug(); } });
      $("#drugAdd").onclick = addDrug;
      $("#rxBody").addEventListener("change", (ev) => {
        const el = ev.target.closest("[data-f]"); if (!el) return;
        const r = rx[Number(el.dataset.i)], f = el.dataset.f;
        r[f] = f === "days" || f === "qty" ? Math.max(1, parseInt(el.value, 10) || 1) : el.value;
        if ((f === "dosage" || f === "days") && !/syrup|inhaler|pen/i.test(O.drug(r.drugId).name)) r.qty = DOSAGE[r.dosage] * r.days;
        renderRx();
      });
      $("#rxBody").onclick = (ev) => { const bt = ev.target.closest("[data-rm]"); if (bt) { rx.splice(Number(bt.dataset.rm), 1); renderRx(); } };
    }
    function updateTotal() {
      const labs = HMS.$$("input[name=lab]:checked").map((c) => O.test(Number(c.value)).rate).reduce((s, n) => s + n, 0);
      const meds = rx.reduce((s, r) => s + O.drug(r.drugId).rate * r.qty, 0);
      $("#totalHint").textContent = "Estimated charges: consultation " + HMS.fmtMoney(O.fee(v.department)) + " · medicines " + HMS.fmtMoney(meds.toFixed(2)) + " · lab " + HMS.fmtMoney(labs);
    }
    $("#cForm").addEventListener("change", (ev) => { if (ev.target.name === "lab") updateTotal(); });
    if (closed) {
      $("#notes").value = (v.consult && v.consult.notes) || ""; $("#notes").disabled = true; $("#dxInput").disabled = true;
      const lo = S.find("labOrders", (o) => o.visitId === v.id);
      if (lo) lo.items.forEach((it) => { const c = $("#lt" + it.testId); if (c) c.checked = true; });
      HMS.$$("#cForm input[name=lab], #followUp, #labUrgent, #drugInput").forEach((el) => (el.disabled = true));
    }
    renderDx(); renderRx();
    if ($("#vouchBtn")) $("#vouchBtn").onclick = () => showVouchers(v.id, true);

    $("#cForm").onsubmit = async (ev) => {
      ev.preventDefault();
      addDx();
      if (!dx.length) { $("#dxInput").classList.add("is-invalid"); return HMS.toast("Enter at least one diagnosis", "warning"); }
      const short = rx.filter((r) => O.stock(r.drugId) < r.qty).map((r) => O.drug(r.drugId).name);
      const labs = HMS.$$("input[name=lab]:checked").map((c) => Number(c.value));
      const body = "<p><b>" + h(b.name) + "</b> · " + h(dx.join(", ")) + "</p><ul class=\"mb-0\"><li>" + rx.length + " medicine(s) to pharmacy</li><li>" + labs.length + " lab test(s) to laboratory</li><li>Charges posted to employee code <b>" + h(v.empCode) + "</b></li></ul>" +
        (short.length ? '<div class="note note-warn mt-2"><i class="bi bi-exclamation-triangle"></i><div>Not enough stock: ' + short.map(h).join(", ") + ". Pharmacy can dispense part and the rest later.</div></div>" : "");
      if (!(await HMS.confirm("Complete consultation?", body, "Complete"))) return;
      try {
        const res = O.completeConsult(v.id, { diagnosis: dx, notes: $("#notes").value, followUpDays: Number($("#followUp").value) || null,
          rx: rx.map((r) => ({ drugId: r.drugId, dosage: r.dosage, days: r.days, qty: r.qty, instruction: r.instruction })), labTests: labs, labPriority: $("#labUrgent").checked ? "urgent" : null });
        HMS.toast("Consultation completed" + (res.order ? " – lab order " + res.order.orderNo : "") + " – printing vouchers");
        showVouchers(v.id, true);
      } catch (err) { HMS.toast(err.message, "danger"); }
    };
  }

  /** After completion: preview the patient, doctor and lab vouchers and print them. */
  function showVouchers(id, autoPrint) {
    const v = O.visit(id), b = O.ben(v);
    $("#queueView").hidden = true; $("#consultView").hidden = false;
    $("#consultView").innerHTML = '<div class="card"><div class="card-header"><div><h3>Vouchers · ' + h(b.name) + " · " + h(v.visitNo) + '</h3><div class="sub">Patient voucher · Doctor voucher · Lab voucher' +
      (S.find("labOrders", (o) => o.visitId === v.id) ? "" : " (no tests ordered – lab voucher printed blank)") + '</div></div><div class="ms-auto d-flex gap-2">' +
      '<button class="btn btn-light border" id="printV"><i class="bi bi-printer me-1"></i>Print again</button><a class="btn btn-primary" href="consult.html"><i class="bi bi-arrow-right me-1"></i>Next patient</a></div></div>' +
      '<div class="card-body"><div class="voucher-preview">' + HMS.vouchers.html(v.id) + "</div></div></div>";
    $("#printV").onclick = () => HMS.vouchers.print(v.id);
    if (autoPrint) HMS.vouchers.print(v.id);
  }

  const vid = Number(HMS.param("visit"));
  if (vid) openConsult(vid); else { renderQueue(); setInterval(renderQueue, 20000); }
})();
