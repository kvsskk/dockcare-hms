(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("settings");
  HMS.layout.render({ page: "settings", title: "Settings", crumb: "System" });
  if (!HMS.auth.can("settings")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const st = HMS.store.settings();
  const REL = ["Spouse", "Son", "Daughter", "Father", "Mother", "Father-in-law", "Mother-in-law", "Brother", "Sister"];
  $("#relations").innerHTML = REL.map((r, i) => '<div class="form-check"><input class="form-check-input" type="checkbox" id="rel' + i + '" value="' + h(r) + '"' + (st.allowedRelations.includes(r) ? " checked" : "") +
    '><label class="form-check-label" for="rel' + i + '">' + h(r) + "</label></div>").join("");
  const NUM = ["childAgeLimit", "parentIncomeLimit", "cardValidityYears", "sessionMinutes"], TXT = ["approverRole", "hospitalName", "city"];
  NUM.concat(TXT).forEach((k) => ($("#" + k).value = st[k]));
  $("#requireAadhaar").checked = !!st.requireAadhaar;
  $("#size").textContent = HMS.store.sizeKB();

  $("#setForm").onsubmit = (e) => {
    e.preventDefault();
    if (!e.target.checkValidity()) { e.target.classList.add("was-validated"); return HMS.toast("Check the highlighted fields", "warning"); }
    const patch = { allowedRelations: HMS.$$("#relations input:checked").map((c) => c.value), requireAadhaar: $("#requireAadhaar").checked };
    NUM.forEach((k) => (patch[k] = Number($("#" + k).value)));
    TXT.forEach((k) => (patch[k] = HMS.clean($("#" + k).value)));
    if (!patch.allowedRelations.length) return HMS.toast("Select at least one eligible relation", "warning");
    const changed = Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(st[k]));
    HMS.store.saveSettings(patch);
    HMS.svc.audit("Settings changed", "settings", "", changed.map((k) => k + "=" + JSON.stringify(patch[k])).join("; ") || "no changes");
    HMS.toast("Settings saved");
  };
  $("#resetBtn").onclick = async () => {
    if (await HMS.confirm("Reset demo data?", "All changes made in this browser will be removed and the sample data loaded again.", "Reset", "btn-danger")) {
      HMS.store.reset(); location.href = "login.html?msg=" + encodeURIComponent("Demo data reset");
    }
  };
})();
