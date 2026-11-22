(function () {
  "use strict";
  const { h, $ } = HMS;
  if (HMS.auth.current()) { location.replace("dashboard.html"); return; }

  const ROLES = [["reception", "people", "Reception"], ["nurse", "heart-pulse", "Nurse"], ["doctor", "clipboard2-pulse", "Doctor"],
    ["lab", "eyedropper", "Lab"], ["pharmacy", "capsule", "Pharmacy"], ["accounts", "currency-rupee", "Accounts"],
    ["hr", "person-badge", "HR"], ["admin", "gear", "Admin"]];
  $("#roles").innerHTML = ROLES.map((r, i) =>
    '<div><input class="visually-hidden" type="radio" name="role" id="role_' + r[0] + '" value="' + r[0] + '"' + (i === 0 ? " checked" : "") + '>' +
    '<label for="role_' + r[0] + '"><i class="bi bi-' + r[1] + '"></i>' + r[2] + "</label></div>").join("");

  $("#demoUsers").innerHTML = "<tbody>" + HMS.store.all("users").map((u) =>
    '<tr><td><a href="#" data-u="' + h(u.username) + '" data-r="' + h(u.role) + '">' + h(u.username) + "</a></td><td>" + h(HMS.svc.ROLE_NAMES[u.role]) + "</td></tr>").join("") + "</tbody>";
  $("#demoUsers").onclick = (e) => {
    const a = e.target.closest("a[data-u]"); if (!a) return;
    e.preventDefault();
    $("#username").value = a.dataset.u; $("#password").value = "Demo@123";
    $("#role_" + a.dataset.r).checked = true;
  };

  const msg = HMS.param("msg");
  if (msg) $("#msg").innerHTML = '<div class="note note-info mb-3"><i class="bi bi-info-circle"></i><div>' + h(msg) + "</div></div>";

  $("#showPw").onclick = () => { const p = $("#password"); p.type = p.type === "password" ? "text" : "password"; };

  $("#loginForm").onsubmit = (e) => {
    e.preventDefault();
    const role = (document.querySelector("input[name=role]:checked") || {}).value;
    try {
      HMS.auth.login($("#username").value, $("#password").value, role);
      location.href = "dashboard.html";
    } catch (err) {
      $("#msg").innerHTML = '<div class="note note-err mb-3"><i class="bi bi-x-circle"></i><div>' + h(err.message) + "</div></div>";
      $("#password").value = ""; $("#password").focus();
    }
  };
})();
