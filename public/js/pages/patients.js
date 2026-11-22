(function () {
  "use strict";
  const { h, $ } = HMS;
  const s = HMS.auth.require("patients");
  HMS.layout.render({ page: "patients", title: "Patient Search & Family View", crumb: "Patients" });
  if (!HMS.auth.can("patients")) return noAccess();

  let currentEmp = null, selectedId = null;

  function noAccess() { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; }

  function photoOrInitials(b, size) {
    size = size || 32;
    return b.photo ? '<img src="' + b.photo + '" alt="" style="width:' + size + "px;height:" + size + 'px;border-radius:50%;object-fit:cover">'
      : '<div class="avatar" style="width:' + size + "px;height:" + size + "px;font-size:" + Math.round(size / 2.8) + 'px">' + h(HMS.initials(b.name)) + "</div>";
  }

  function search(q) {
    const list = HMS.svc.search(q);
    history.replaceState(null, "", "patients.html?q=" + encodeURIComponent(q));
    if (list.length === 1) { $("#results").innerHTML = ""; return openFamily(list[0].code); }
    $("#familyWrap").hidden = true;
    if (!list.length) {
      $("#results").innerHTML = '<div class="card"><div class="empty"><i class="bi bi-search"></i>No employee or beneficiary found for “' + h(q) + "”.</div></div>";
      return;
    }
    $("#results").innerHTML = '<div class="card"><div class="card-header"><h3>' + list.length + ' matches</h3></div><div class="table-responsive"><table class="table table-hover"><thead><tr><th>Code</th><th>Employee</th><th>Designation</th><th>Department</th><th>Family</th></tr></thead><tbody>' +
      list.map((e) => '<tr class="clickable" data-code="' + h(e.code) + '"><td class="mono"><b>' + h(e.code) + "</b></td><td>" + h(e.name) + "</td><td>" + h(e.designation) + '</td><td class="text-muted">' + h(e.department) + "</td><td>" + HMS.svc.family(e.code).length + "</td></tr>").join("") +
      "</tbody></table></div></div>";
    $("#results tbody").onclick = (ev) => { const tr = ev.target.closest("tr[data-code]"); if (tr) openFamily(tr.dataset.code); };
  }

  function openFamily(code, sel) {
    const e = HMS.svc.employee(code);
    if (!e) return;
    currentEmp = e;
    history.replaceState(null, "", "patients.html?emp=" + encodeURIComponent(e.code));
    $("#results").innerHTML = "";
    $("#familyWrap").hidden = false;
    const fam = HMS.svc.family(e.code);
    const activeCount = fam.filter((b) => b.status === "active").length;
    $("#empHead").innerHTML =
      '<div class="avatar navy" style="width:50px;height:50px;font-size:17px">' + h(HMS.initials(e.name)) + "</div>" +
      '<div class="flex-grow-1"><div style="font-size:16px;font-weight:700">' + h(e.name) + ' <span class="chip ' + (e.status === "active" ? "chip-green" : "chip-red") + ' ms-1">' + (e.status === "active" ? "Active employee" : h(e.status)) + "</span></div>" +
      '<div class="text-muted mt-1"><span class="mono">' + h(e.code) + "</span> · " + h(e.designation) + " · " + h(e.department) + " · Grade " + h(e.grade) + "</div></div>" +
      '<div class="text-end"><div class="text-muted small">Family members</div><div style="font-size:20px;font-weight:700">' + fam.length + "</div></div>" +
      '<div class="text-end ps-3 border-start"><div class="text-muted small">Active</div><div style="font-size:20px;font-weight:700">' + activeCount + "</div></div>";

    const canEdit = HMS.auth.can("dependent"), canCard = HMS.auth.can("cards");
    $("#members").innerHTML = fam.map((b) => {
      const st = HMS.svc.effectiveStatus(b);
      let act = "";
      if (st === "active" && canCard) act += '<a class="btn btn-sm btn-light border" href="cards.html?id=' + b.id + '" title="Print card"><i class="bi bi-person-vcard"></i></a> ';
      if ((st === "returned" || st === "pending") && canEdit && b.relation !== "Self") act += '<a class="btn btn-sm btn-light border" href="dependent.html?id=' + b.id + '" title="Edit"><i class="bi bi-pencil"></i></a> ';
      const el = HMS.opd.eligibility(b);
      if (HMS.auth.can("opd") && el.ok) act += '<a class="btn btn-sm ' + (el.emergencyOnly ? "btn-outline-danger" : "btn-primary") + '" href="opd.html?ben=' + b.id + '" title="' + (el.emergencyOnly ? "Emergency visit only" : "Register OPD visit") + '"><i class="bi bi-clipboard2-plus me-1"></i>' + (el.emergencyOnly ? "Emergency" : "Visit") + "</a>";
      return '<tr class="clickable' + (b.id === sel ? " selected" : "") + '" data-id="' + b.id + '"><td><div class="d-flex gap-2 align-items-center">' + photoOrInitials(b) + "<b>" + h(b.name) + "</b></div></td><td>" + h(b.relation) +
        "</td><td>" + (HMS.age(b.dob) ?? "–") + " / " + h((b.gender || "")[0] || "") + "</td><td>" + h(b.bloodGroup || "–") + '</td><td class="mono">' + h(b.regnNo || "—") + "</td><td>" + HMS.svc.statusChip(b) +
        '</td><td class="text-end text-nowrap">' + act + "</td></tr>";
    }).join("");
    $("#members").onclick = (ev) => {
      if (ev.target.closest("a,button")) return;
      const tr = ev.target.closest("tr[data-id]"); if (tr) showDetail(Number(tr.dataset.id));
    };
    const addBtn = $("#addDepBtn");
    if (canEdit) { addBtn.href = "dependent.html?emp=" + encodeURIComponent(e.code); addBtn.innerHTML = '<i class="bi bi-person-plus me-1"></i>Add dependent under ' + h(e.code); }
    else addBtn.hidden = true;
    showDetail(sel || (fam[0] && fam[0].id));
  }

  function visitsHTML(b) {
    const list = HMS.store.filter("visits", (v) => v.benId === b.id && v.status !== "cancelled").sort((x, y) => (y.date + y.createdAt).localeCompare(x.date + x.createdAt)).slice(0, 5);
    if (!list.length) return "";
    return '<div class="fw-semibold mb-1">Recent visits</div>' + list.map((v) => '<div class="d-flex gap-2 py-1 border-bottom small"><span class="text-muted" style="width:72px">' + h(HMS.fmtDate(v.date)) + "</span><span>" +
      h(v.consult ? v.consult.diagnosis.join(", ") : v.complaint || v.department) + '</span><span class="ms-auto">' + HMS.opd.visitChip(v) + "</span></div>").join("");
  }

  function showDetail(id) {
    selectedId = id;
    HMS.$$("#members tr").forEach((tr) => tr.classList.toggle("selected", Number(tr.dataset.id) === id));
    const b = HMS.svc.beneficiary(id);
    if (!b) { $("#detail").innerHTML = '<div class="empty">Select a family member</div>'; return; }
    const row = (l, v) => '<div class="col-6"><div class="text-muted small">' + l + '</div><div class="fw-semibold">' + (v || "—") + "</div></div>";
    const hist = (b.history || []).slice().reverse().map((x) => '<div class="d-flex gap-2 py-1"><i class="bi bi-dot text-success"></i><div><b>' + h(x.action) + '</b> <span class="text-muted small">' + h(HMS.fmtDateTime(x.at)) + " · " + h(x.by) + "</span>" + (x.remarks ? '<div class="small">' + h(x.remarks) + "</div>" : "") + "</div></div>").join("");
    $("#detail").innerHTML =
      '<div class="card-header"><h3>Beneficiary details</h3><span class="ms-auto">' + HMS.svc.statusChip(b) + "</span></div>" +
      '<div class="card-body"><div class="d-flex gap-3 align-items-center mb-3">' +
      (b.photo ? '<img src="' + b.photo + '" alt="Photo" style="width:70px;height:84px;object-fit:cover;border-radius:8px">' : '<div class="photo-box" style="width:70px;height:84px;font-size:26px"><i class="bi bi-person"></i></div>') +
      '<div><div class="fw-bold" style="font-size:15px">' + h(b.name) + '</div><div class="text-muted">' + h(b.relation) + " of " + h(b.empCode) + "</div>" +
      (b.regnNo ? '<div class="mono mt-1">Regn. No. ' + h(b.regnNo) + "</div>" : "") + "</div></div>" +
      '<div class="row g-2 mb-3">' + row("Date of birth", h(HMS.fmtDate(b.dob)) + (b.dobApprox ? ' <span class="chip chip-amber">approx.</span>' : "")) + row("Age", HMS.age(b.dob) + " years") +
      row("Gender", h(b.gender)) + row("Blood group", h(b.bloodGroup)) + row("Aadhaar", h(HMS.maskAadhaar(b.aadhaar))) + row("Old book no.", h(b.oldBookNo)) +
      row("Identification marks", h(b.idMarks)) + row("Valid upto", h(HMS.fmtDate(b.validUpto))) +
      (b.income != null ? row("Monthly income", h(HMS.fmtMoney(b.income))) : "") + row("Card printed", b.cardPrints ? h(HMS.fmtDate((b.cardPrintedAt || "").slice(0, 10))) + " (" + b.cardPrints + "×)" : "Not yet") + "</div>" +
      (b.remarks ? '<div class="note note-info mb-3"><i class="bi bi-chat-left-text"></i><div>' + h(b.remarks) + "</div></div>" : "") +
      visitsHTML(b) + (hist ? '<div class="fw-semibold mb-1 mt-3">Registration history</div>' + hist : "") + "</div>";
  }

  $("#searchForm").onsubmit = (ev) => { ev.preventDefault(); const q = HMS.clean($("#q").value); if (q) search(q); };
  const emp = HMS.param("emp"), q = HMS.param("q");
  if (emp) openFamily(emp, Number(HMS.param("sel")) || null);
  else if (q) { $("#q").value = q; search(q); }
})();
