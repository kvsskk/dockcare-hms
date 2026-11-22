(function () {
  "use strict";
  const { h, $ } = HMS;
  const s = HMS.auth.require("dashboard");
  HMS.layout.render({ page: "dashboard", title: "Dashboard", crumb: "Welcome, " + s.name });

  const S = HMS.store;
  const emps = S.all("employees").filter((e) => e.status === "active");
  const bens = S.all("beneficiaries");
  const active = bens.filter((b) => HMS.svc.effectiveStatus(b) === "active");
  const pending = HMS.svc.pendingCount();
  const toPrint = active.filter((b) => !b.cardPrints).length;
  const expired = bens.filter((b) => HMS.svc.effectiveStatus(b) === "expired").length;

  const kpi = (icon, label, value, detail, color, href) =>
    '<div class="col-sm-6 col-xl-3"><' + (href ? 'a href="' + href + '"' : "div") + ' class="card kpi p-3 h-100 text-decoration-none text-reset">' +
    '<div class="l"><i class="bi bi-' + icon + '"></i>' + label + '</div><div class="v"' + (color ? ' style="color:' + color + '"' : "") + ">" + value + '</div><div class="d">' + detail + "</div></" + (href ? "a" : "div") + "></div>";
  $("#kpis").innerHTML =
    kpi("people", "Employees", emps.length.toLocaleString("en-IN"), "Active in HR master", "", HMS.auth.can("employees") ? "employees.html" : "") +
    kpi("person-check", "Active beneficiaries", active.length.toLocaleString("en-IN"), (active.length / Math.max(emps.length, 1)).toFixed(1) + " per employee", "") +
    kpi("patch-check", "Pending approvals", pending, "Waiting for " + (S.settings().approverRole === "hr" ? "HR" : "Hospital Admin"), pending ? "var(--amber)" : "", HMS.auth.can("approvals") ? "approvals.html" : "") +
    kpi("person-vcard", "Cards to print", toPrint, expired + " expired card" + (expired === 1 ? "" : "s"), "", HMS.auth.can("cards") ? "cards.html" : "");

  // today's OPD
  const t = HMS.todayISO();
  const vis = S.filter("visits", (v) => v.date === t && v.status !== "cancelled");
  const chToday = S.filter("charges", (c) => c.date === t).reduce((n, c) => n + c.amount, 0);
  $("#kpis").innerHTML += '<div class="col-12"><div class="fw-semibold text-muted small text-uppercase" style="letter-spacing:.6px">Today\'s OPD</div></div>' +
    kpi("clipboard2-plus", "Visits today", vis.length, vis.filter((v) => v.visitType === "emergency").length + " emergency", "", HMS.auth.can("opd") ? "opd.html" : "") +
    kpi("hourglass-split", "Waiting", vis.filter((v) => ["registered", "vitals_done", "in_consultation"].includes(v.status)).length, "For vitals or doctor", "", HMS.auth.can("vitals") ? "vitals.html" : HMS.auth.can("consult") ? "consult.html" : "") +
    kpi("eyedropper", "Lab pending", S.filter("labOrders", (o) => o.status !== "released").length, "Samples and results", "", HMS.auth.can("lab") ? "lab.html" : "") +
    kpi("receipt", "Charged today", HMS.fmtMoney(Math.round(chToday)), "Against employee codes", "", HMS.auth.can("charges") ? "charges.html" : "");

  const ACTIONS = [
    ["opd", "clipboard2-plus", "Register OPD visit", "opd.html"], ["vitals", "heart-pulse", "Record vitals", "vitals.html"], ["consult", "clipboard2-pulse", "My patient queue", "consult.html"],
    ["lab", "eyedropper", "Lab worklist", "lab.html"], ["pharmacy", "capsule", "Dispense medicines", "pharmacy.html"], ["charges", "receipt", "Employee charges", "charges.html"],
    ["patients", "search", "Find patient / family", "patients.html"], ["dependent", "person-plus", "Add dependent", "dependent.html"],
    ["cards", "person-vcard", "Print cards", "cards.html"], ["approvals", "patch-check", "Review approvals", "approvals.html"],
    ["import", "file-earmark-arrow-up", "Import from Excel", "import.html"], ["employees", "people", "Employee master", "employees.html"],
    ["settings", "gear", "Eligibility rules", "settings.html"],
  ].filter((a) => HMS.auth.can(a[0]));
  $("#actions").innerHTML = ACTIONS.length ? ACTIONS.map((a) => '<a class="btn btn-light border" href="' + a[3] + '"><i class="bi bi-' + a[1] + ' me-1"></i>' + a[2] + "</a>").join("") :
    '<div class="text-muted">Your screens (' + h(HMS.svc.ROLE_NAMES[s.role]) + ") arrive in Build 3.</div>";

  const log = S.all("audit").slice(-8).reverse();
  $("#activity").innerHTML = log.length ? log.map((a) => "<tr><td class='mono text-muted'>" + h(HMS.fmtDateTime(a.at)) + "</td><td><b>" + h(a.action) + "</b></td><td class='text-muted'>" + h(a.details) + "</td><td>" + h(a.name) + "</td></tr>").join("")
    : '<tr><td colspan="4" class="empty">No activity yet</td></tr>';

  const bar = (label, n, total, color) => '<div class="mb-2"><div class="d-flex justify-content-between small"><span>' + h(label) + "</span><b>" + n + '</b></div><div class="progress" style="height:8px"><div class="progress-bar" style="width:' + (total ? (n / total) * 100 : 0) + "%;background:" + color + '"></div></div></div>';
  const rel = {}; active.forEach((b) => (rel[b.relation] = (rel[b.relation] || 0) + 1));
  $("#relations").innerHTML = HMS.svc.REL_ORDER.map((r) => bar(r, rel[r] || 0, active.length, "var(--teal)")).join("");

  const sizes = {}; emps.forEach((e) => { const n = HMS.svc.family(e.code).filter((b) => b.status === "active").length; const k = n >= 6 ? "6+" : String(n); sizes[k] = (sizes[k] || 0) + 1; });
  $("#famsize").innerHTML = ["1", "2", "3", "4", "5", "6+"].map((k) => bar(k + " member" + (k === "1" ? "" : "s"), sizes[k] || 0, emps.length, "#2C6E9C")).join("");
})();
