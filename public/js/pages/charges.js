(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("charges");
  HMS.layout.render({ page: "charges", title: "Employee Charges", crumb: "Finance" });
  if (!HMS.auth.can("charges")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, O = HMS.opd, st = S.settings();
  const money = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let sel = HMS.param("emp") || null;
  $("#month").value = HMS.param("month") || HMS.todayISO().slice(0, 7);
  const monthLabel = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  function data() {
    const q = HMS.clean($("#q").value).toLowerCase();
    return O.monthSummary($("#month").value).map((r) => Object.assign(r, { emp: HMS.svc.employee(r.empCode) || { name: "" } }))
      .filter((r) => !q || r.empCode.toLowerCase().includes(q) || r.emp.name.toLowerCase().includes(q));
  }

  function render() {
    const rows = data(), all = O.monthSummary($("#month").value);
    const sum = (k) => all.reduce((s, r) => s + r[k], 0);
    const k = (icon, l, v, d, c) => '<div class="col-sm-6 col-xl-3"><div class="card kpi p-3 h-100"><div class="l"><i class="bi bi-' + icon + '"></i>' + l + '</div><div class="v"' + (c ? ' style="color:' + c + '"' : "") + ">" + v + '</div><div class="d">' + d + "</div></div></div>";
    $("#kpis").innerHTML = k("people", "Employees with charges", all.length, "of " + S.filter("employees", (e) => e.status === "active").length + " employees") +
      k("currency-rupee", "Total for " + monthLabel($("#month").value), "₹ " + Math.round(sum("total")).toLocaleString("en-IN"), "Consult " + Math.round(sum("consultation")).toLocaleString("en-IN") + " · Lab " + Math.round(sum("lab")).toLocaleString("en-IN") + " · Pharmacy " + Math.round(sum("pharmacy")).toLocaleString("en-IN")) +
      k("clipboard2-pulse", "Visits charged", sum("visits"), "Completed OPD visits") + k("pause-circle", "Held", "₹ " + Math.round(sum("held")).toLocaleString("en-IN"), "Dependents pending approval", sum("held") ? "var(--amber)" : "");
    $("#list").innerHTML = rows.length ? rows.map((r) => '<tr class="clickable' + (r.empCode === sel ? " selected" : "") + '" data-code="' + h(r.empCode) + '"><td class="mono"><b>' + h(r.empCode) + "</b></td><td>" + h(r.emp.name) +
      '</td><td class="text-end">' + r.visits + '</td><td class="text-end">' + money(r.consultation) + '</td><td class="text-end">' + money(r.lab) + '</td><td class="text-end">' + money(r.pharmacy) + '</td><td class="text-end fw-bold">' + money(r.total) +
      '</td><td class="text-end">' + (r.held ? '<span class="chip chip-amber">' + money(r.held) + "</span>" : "") + "</td></tr>").join("")
      : '<tr><td colspan="8" class="empty"><i class="bi bi-receipt"></i>No charges for this month</td></tr>';
    renderDetail();
  }

  function lineGroups(r) {
    const byVisit = {};
    r.lines.forEach((c) => { (byVisit[c.visitId] = byVisit[c.visitId] || []).push(c); });
    return Object.entries(byVisit).map(([vid, lines]) => ({ v: O.visit(Number(vid)), lines })).sort((a, b) => a.v.date.localeCompare(b.v.date) || a.v.id - b.v.id);
  }

  function renderDetail() {
    const r = sel && O.monthSummary($("#month").value).find((x) => x.empCode === sel);
    if (!r) { $("#detail").innerHTML = '<div class="empty"><i class="bi bi-hand-index"></i>Select an employee to see the visit-wise breakup</div>'; return; }
    const e = HMS.svc.employee(sel) || {};
    $("#detail").innerHTML = '<div class="card-header"><div><h3>' + h(e.name) + ' <span class="mono text-muted fw-normal">' + h(sel) + '</span></h3><div class="sub">' + h(e.designation || "") + (e.department ? " · " + h(e.department) : "") + " · " + monthLabel($("#month").value) +
      '</div></div><button class="btn btn-sm btn-light border ms-auto" id="stmtBtn"><i class="bi bi-printer me-1"></i>Statement</button></div><div class="card-body" style="max-height:60vh;overflow:auto">' +
      lineGroups(r).map((g) => { const b = HMS.svc.beneficiary(g.v.benId);
        return '<div class="mb-3"><div class="d-flex justify-content-between"><b>' + h(HMS.fmtDate(g.v.date)) + " · " + h(b.name) + ' <span class="text-muted fw-normal">(' + h(b.relation) + ')</span></b><span class="mono small text-muted">' + h(g.v.visitNo) + "</span></div>" +
          (g.v.consult ? '<div class="small text-muted mb-1">' + h(g.v.consult.diagnosis.join(", ")) + " · " + h(O.doctorName(g.v.doctor)) + "</div>" : "") +
          g.lines.map((c) => '<div class="d-flex small border-bottom py-1"><span>' + h(c.description) + (c.held ? ' <span class="chip chip-amber">Held</span>' : "") + '</span><span class="ms-auto">' + money(c.amount) + "</span></div>").join("") + "</div>"; }).join("") +
      '<div class="d-flex fw-bold border-top pt-2"><span>Total recoverable</span><span class="ms-auto">₹ ' + money(r.total) + "</span></div>" + (r.held ? '<div class="d-flex small text-muted"><span>Held (pending approval)</span><span class="ms-auto">₹ ' + money(r.held) + "</span></div>" : "") + "</div>";
    $("#stmtBtn").onclick = () => { HMS.printHTML(statementHTML(r, e)); HMS.svc.audit("Charge statement printed", "employee", sel, monthLabel($("#month").value)); };
  }

  function statementHTML(r, e) {
    return '<div class="report-sheet"><div style="display:flex;align-items:center;gap:4mm;border-bottom:.6mm solid #0E2A47;padding-bottom:3mm"><i class="bi bi-life-preserver" style="font-size:9mm;color:#0E2A47"></i><div><b style="font-size:14pt">' + h(st.hospitalName.toUpperCase()) +
      '</b><div style="font-size:9pt;color:#556">Medical charges statement · ' + monthLabel($("#month").value) + '</div></div></div><table style="margin:3mm 0"><tr><td><b>Employee</b> ' + h(e.name) + "</td><td><b>Code</b> " + h(e.code) + "</td><td><b>Department</b> " + h(e.department || "–") + "</td></tr></table>" +
      "<table><tr><th>Date</th><th>Patient</th><th>OPD No.</th><th>Item</th><th style=\"text-align:right\">Amount (₹)</th></tr>" +
      lineGroups(r).flatMap((g) => { const b = HMS.svc.beneficiary(g.v.benId); return g.lines.map((c) => "<tr><td>" + h(HMS.fmtDate(c.date)) + "</td><td>" + h(b.name) + " (" + h(b.relation) + ")</td><td>" + h(g.v.visitNo) + "</td><td>" + h(c.description) + (c.held ? " (held)" : "") + '</td><td style="text-align:right">' + money(c.amount) + "</td></tr>"); }).join("") +
      '<tr><td colspan="4" style="text-align:right"><b>Total recoverable</b></td><td style="text-align:right"><b>' + money(r.total) + "</b></td></tr></table>" +
      '<div style="margin-top:6mm;font-size:8.5pt;color:#556">Recovery is subject to the hospital billing rules (coverage, monthly cap). Queries: Hospital helpdesk.</div></div>';
  }

  $("#exportBtn").onclick = () => {
    const ym = $("#month").value, all = O.monthSummary(ym);
    const summary = all.map((r) => { const e = HMS.svc.employee(r.empCode) || {}; return { "Employee Code": r.empCode, "Employee Name": e.name, Department: e.department, Visits: r.visits, Consultation: r.consultation, Lab: r.lab, Pharmacy: r.pharmacy, "Total Recoverable": r.total, Held: r.held }; });
    const detail = [];
    all.forEach((r) => r.lines.forEach((c) => { const b = HMS.svc.beneficiary(c.benId) || {}, v = O.visit(c.visitId) || {};
      detail.push({ Date: HMS.fmtDate(c.date), "Employee Code": c.empCode, Beneficiary: b.name, Relation: b.relation, "OPD No": v.visitNo, Type: c.source, Item: c.description, Amount: c.amount, Held: c.held ? "Yes" : "" }); }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Detail");
    XLSX.writeFile(wb, "employee_charges_" + ym + ".xlsx");
    HMS.svc.audit("Charges exported", "export", ym, all.length + " employees");
  };
  $("#month").onchange = () => { sel = null; render(); };
  $("#q").oninput = HMS.debounce(render, 200);
  $("#list").onclick = (e) => { const tr = e.target.closest("tr[data-code]"); if (!tr) return; sel = tr.dataset.code; render(); };
  render();
})();
