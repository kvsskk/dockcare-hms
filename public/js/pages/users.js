(function () {
  "use strict";
  const { h, $ } = HMS;
  const me = HMS.auth.require("users");
  HMS.layout.render({ page: "users", title: "Users & Roles", crumb: "System" });
  if (!HMS.auth.can("users")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store;
  $("#role").innerHTML = Object.entries(HMS.svc.ROLE_NAMES).map(([k, v]) => '<option value="' + k + '">' + h(v) + "</option>").join("");

  function render() {
    $("#list").innerHTML = S.all("users").map((u) => '<tr><td class="mono"><b>' + h(u.username) + "</b></td><td>" + h(u.name) + "</td><td>" + h(HMS.svc.ROLE_NAMES[u.role]) + "</td><td>" +
      (u.active ? '<span class="chip chip-green">Active</span>' : '<span class="chip chip-grey">Disabled</span>') + '</td><td class="text-end text-nowrap">' +
      (u.username === me.username ? '<span class="text-muted small">You</span>' :
        '<button class="btn btn-sm btn-light border" data-reset="' + u.id + '">Reset password</button> <button class="btn btn-sm btn-light border" data-toggle="' + u.id + '">' + (u.active ? "Disable" : "Enable") + "</button>") + "</td></tr>").join("");
  }
  $("#list").onclick = async (e) => {
    const t = e.target.closest("[data-toggle]"), r = e.target.closest("[data-reset]");
    if (t) { const u = S.get("users", t.dataset.toggle); S.update("users", u.id, { active: !u.active }); HMS.svc.audit(u.active ? "User enabled" : "User disabled", "user", u.username, ""); render(); }
    if (r) {
      const u = S.get("users", r.dataset.reset);
      const pw = "Hms@" + Math.floor(1000 + Math.random() * 9000);
      if (await HMS.confirm("Reset password for " + u.name + "?", "<p>New temporary password: <code>" + pw + "</code><br>Give it to the user in person.</p>", "Reset")) {
        S.update("users", u.id, { password: pw }); HMS.svc.audit("Password reset", "user", u.username, ""); HMS.toast("Password reset");
      }
    }
  };
  $("#addForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.checkValidity()) { f.classList.add("was-validated"); return; }
    const username = $("#username").value.trim().toLowerCase();
    if (S.find("users", (u) => u.username === username)) return HMS.toast("User ID already exists", "danger");
    S.insert("users", { username, name: HMS.clean($("#name").value), role: $("#role").value, password: $("#password").value, active: true });
    HMS.svc.audit("User added", "user", username, HMS.svc.ROLE_NAMES[$("#role").value]);
    f.reset(); f.classList.remove("was-validated"); HMS.toast("User added"); render();
  };
  render();
})();
