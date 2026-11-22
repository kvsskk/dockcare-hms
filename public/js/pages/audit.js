(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("audit");
  HMS.layout.render({ page: "audit", title: "Audit Log", crumb: "System" });
  if (!HMS.auth.can("audit")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store;
  const users = Array.from(new Set(S.all("audit").map((a) => a.user))).sort();
  $("#user").innerHTML += users.map((u) => "<option>" + h(u) + "</option>").join("");

  function filtered() {
    const q = HMS.clean($("#q").value).toLowerCase(), u = $("#user").value, from = $("#from").value;
    return S.all("audit").filter((a) => (!u || a.user === u) && (!from || a.at.slice(0, 10) >= from) &&
      (!q || (a.action + " " + a.details + " " + a.ref).toLowerCase().includes(q))).slice().reverse();
  }
  function render() {
    const list = filtered();
    $("#list").innerHTML = list.slice(0, 500).map((a) => '<tr><td class="mono text-muted">' + h(HMS.fmtDateTime(a.at)) + "</td><td>" + h(a.name) + '</td><td class="text-muted">' + h(HMS.svc.ROLE_NAMES[a.role] || a.role) +
      "</td><td><b>" + h(a.action) + '</b></td><td class="mono">' + h(a.entity) + (a.ref ? " #" + h(a.ref) : "") + '</td><td class="text-muted">' + h(a.details) + "</td></tr>").join("") || '<tr><td colspan="6" class="empty">No entries</td></tr>';
    $("#count").textContent = list.length + " entries" + (list.length > 500 ? " (showing latest 500)" : "") + ". Entries cannot be edited or deleted.";
  }
  ["q", "user", "from"].forEach((id) => $("#" + id).addEventListener("input", HMS.debounce(render, 200)));
  $("#exportBtn").onclick = () => {
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = ["Time,User,Role,Action,Entity,Record,Details"].concat(filtered().map((a) => [a.at, a.user, a.role, a.action, a.entity, a.ref, a.details].map(esc).join(","))).join("\r\n");
    HMS.downloadText("audit_log_" + HMS.todayISO() + ".csv", "﻿" + csv, "text/csv");
  };
  render();
})();
