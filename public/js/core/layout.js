/* Shared page frame: sidebar menu (by role), top bar, demo banner. */
(function (HMS) {
  "use strict";

  // soon: which later build delivers the screen (shown greyed out in the menu)
  const MENU = [
    { key: "dashboard", label: "Dashboard", icon: "grid-1x2", href: "dashboard.html" },
    { sec: "Patients" },
    { key: "patients", label: "Patient Search", icon: "search", href: "patients.html" },
    { key: "dependent", label: "Add Dependent", icon: "person-plus", href: "dependent.html" },
    { key: "cards", label: "Card Issue", icon: "person-vcard", href: "cards.html" },
    { key: "opd", label: "OPD Visits", icon: "clipboard2-plus", href: "opd.html" },
    { sec: "Clinical" },
    { key: "vitals", label: "Patient Queue & Vitals", icon: "heart-pulse", href: "vitals.html", badge: () => HMS.store.filter("visits", (v) => v.date === HMS.todayISO() && v.status === "registered").length },
    { key: "consult", label: "Consultation", icon: "clipboard2-pulse", href: "consult.html", badge: () => { const me = HMS.auth.current(); return me.role === "doctor" ? HMS.opd.waitingFor(me.username) : 0; } },
    { key: "lab", label: "Lab Worklist", icon: "eyedropper", href: "lab.html", badge: () => HMS.store.filter("labOrders", (o) => o.status !== "released").length },
    { key: "pharmacy", label: "Pharmacy", icon: "capsule", href: "pharmacy.html", badge: () => new Set(HMS.store.filter("rxItems", (r) => r.qtyDispensed < r.qty).map((r) => r.visitId)).size },
    { sec: "Beneficiaries" },
    { key: "employees", label: "Employees", icon: "people", href: "employees.html" },
    { key: "approvals", label: "Dependent Approvals", icon: "patch-check", href: "approvals.html", badge: () => HMS.svc.pendingCount() },
    { key: "import", label: "Data Import", icon: "file-earmark-arrow-up", href: "import.html" },
    { sec: "Finance" },
    { key: "charges", label: "Employee Charges", icon: "receipt", href: "charges.html" },
    { key: "payroll", label: "Payroll Deductions", icon: "currency-rupee", soon: "Build 3", roles: ["accounts", "admin"] },
    { key: "billing", label: "Billing & Tariff", icon: "sliders", soon: "Build 3", roles: ["admin"] },
    { sec: "System" },
    { key: "users", label: "Users & Roles", icon: "person-gear", href: "users.html" },
    { key: "audit", label: "Audit Log", icon: "journal-text", href: "audit.html" },
    { key: "settings", label: "Settings", icon: "gear", href: "settings.html" },
  ];

  function visible(item, role) {
    if (item.soon) return item.roles.includes(role);
    return HMS.auth.can(item.key, role);
  }

  HMS.layout = {
    /** opts: { page, title, crumb, actions (html) } – call once per page after HMS.auth.require(). */
    render(opts) {
      const s = HMS.auth.current();
      const role = s.role;
      let nav = "", pendingSec = null;
      MENU.forEach((m) => {
        if (m.sec) { pendingSec = m.sec; return; }
        if (!visible(m, role)) return;
        if (pendingSec) { nav += '<div class="sec">' + pendingSec + "</div>"; pendingSec = null; }
        const n = m.badge ? m.badge() : 0;
        if (m.soon) nav += '<a class="soon" title="Coming in ' + m.soon + '"><i class="bi bi-' + m.icon + '"></i>' + m.label + '<span class="soon-tag">' + m.soon + "</span></a>";
        else nav += '<a href="' + m.href + '"' + (m.key === opts.page ? ' class="active" aria-current="page"' : "") + '><i class="bi bi-' + m.icon + '"></i>' + m.label +
          (n ? '<span class="badge rounded-pill text-bg-danger">' + n + "</span>" : "") + "</a>";
      });

      const page = HMS.$("#page");
      const shell = document.createElement("div");
      shell.className = "app-shell";
      shell.innerHTML =
        '<aside class="sidebar" id="sidebar"><a class="brand" href="dashboard.html"><div class="logo"><i class="bi bi-life-preserver"></i></div><div><b>DockCare</b><small>Hospital Management System</small></div></a>' +
        '<div class="rolebox">Signed in as<b>' + HMS.h(HMS.svc.ROLE_NAMES[role]) + "</b></div>" +
        '<nav class="sidenav">' + nav + "</nav>" +
        '<div class="sidefoot"><i class="bi bi-shield-check me-1"></i>Secure session · auto logout ' + HMS.store.settings().sessionMinutes + " min</div></aside>" +
        '<div class="main"><div class="demo-banner no-print"><i class="bi bi-info-circle me-1"></i>Demo mode – sample data is stored in this browser only. ' +
        '<a href="#" id="resetDemo" class="link-dark">Reset demo data</a></div>' +
        '<header class="topbar"><button class="btn btn-light btn-sm menu-toggle" id="menuToggle" aria-label="Menu"><i class="bi bi-list"></i></button>' +
        '<div><div class="crumb">' + HMS.h(opts.crumb || "") + "</div><h1>" + HMS.h(opts.title) + "</h1></div>" +
        '<div class="ms-auto d-flex align-items-center gap-3">' + (opts.actions || "") +
        '<form class="global-search d-flex" id="globalSearch" role="search"><div class="input-group input-group-sm" style="width:280px"><span class="input-group-text bg-white"><i class="bi bi-search"></i></span>' +
        '<input class="form-control" name="q" placeholder="Employee code, name, Regn. No." aria-label="Search"></div></form>' +
        '<div class="user"><div class="avatar">' + HMS.initials(s.name) + '</div><div class="lh-sm d-none d-md-block"><b class="d-block" style="font-size:13px">' + HMS.h(s.name) +
        '</b><span class="text-muted" style="font-size:11.5px">' + HMS.h(HMS.svc.ROLE_NAMES[role]) + "</span></div>" +
        '<button class="btn btn-light btn-sm" id="logoutBtn" title="Sign out"><i class="bi bi-box-arrow-right"></i></button></div></div></header>' +
        '<div class="content"></div></div>';
      page.parentNode.insertBefore(shell, page);
      shell.querySelector(".content").appendChild(page);
      page.hidden = false;
      document.title = opts.title + " · DockCare";

      HMS.$("#logoutBtn").onclick = () => HMS.auth.logout();
      HMS.$("#menuToggle").onclick = () => HMS.$("#sidebar").classList.toggle("open");
      HMS.$("#globalSearch").onsubmit = (e) => {
        e.preventDefault();
        const q = HMS.clean(e.target.q.value);
        if (q) location.href = (HMS.auth.can("patients") ? "patients.html" : "employees.html") + "?q=" + encodeURIComponent(q);
      };
      HMS.$("#resetDemo").onclick = async (e) => {
        e.preventDefault();
        if (await HMS.confirm("Reset demo data?", "All changes made in this browser will be removed and the sample data loaded again.", "Reset", "btn-danger")) {
          HMS.store.reset(); location.href = "login.html?msg=" + encodeURIComponent("Demo data reset");
        }
      };
    },
  };
})(window.HMS);
