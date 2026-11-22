(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("opd");
  HMS.layout.render({ page: "opd", title: "OPD Visits", crumb: "Reception" });
  if (!HMS.auth.can("opd")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, O = HMS.opd, st = S.settings();
  let ben = null;

  // ---------- departments & doctors ----------
  $("#department").innerHTML = O.departments().map((d) => "<option>" + h(d.name) + "</option>").join("");
  function fillDoctors() {
    const docs = O.doctors($("#department").value);
    $("#doctor").innerHTML = docs.length ? docs.map((u) => '<option value="' + h(u.username) + '">' + h(u.name) + " – Room " + h(u.room || "–") + " (" + O.waitingFor(u.username) + " waiting)</option>").join("")
      : '<option value="">No doctor in this department</option>';
  }
  $("#department").onchange = fillDoctors;

  // ---------- find patient ----------
  function find(q) {
    const emps = HMS.svc.search(q);
    if (!emps.length) { $("#family").innerHTML = '<div class="card-body border-top"><div class="empty py-3"><i class="bi bi-search"></i>No employee or beneficiary found</div></div>'; return; }
    if (emps.length > 1) {
      $("#family").innerHTML = '<div class="table-responsive border-top"><table class="table table-hover table-sm"><tbody>' + emps.map((e) => '<tr class="clickable" data-code="' + h(e.code) + '"><td class="mono"><b>' + h(e.code) + "</b></td><td>" + h(e.name) + '</td><td class="text-muted">' + h(e.department) + "</td></tr>").join("") + "</tbody></table></div>";
      $("#family tbody").onclick = (ev) => { const tr = ev.target.closest("[data-code]"); if (tr) showFamily(tr.dataset.code); };
      return;
    }
    // a scanned card QR is "RegnNo|EmpCode" – select that person directly
    const regn = q.split("|")[0].trim().toUpperCase();
    const direct = S.find("beneficiaries", (b) => b.regnNo === regn);
    showFamily(emps[0].code, direct && direct.id);
  }
  function showFamily(code, selId) {
    const fam = HMS.svc.family(code), e = HMS.svc.employee(code);
    $("#family").innerHTML = '<div class="border-top px-3 py-2 small text-muted">Family of <b class="text-dark">' + h(e.name) + '</b> (<span class="mono">' + h(code) + '</span>) – select the patient</div>' +
      '<div class="table-responsive"><table class="table table-hover table-sm"><tbody>' + fam.map((b) => {
        const el = O.eligibility(b);
        return '<tr class="clickable" data-id="' + b.id + '"><td style="width:28px"><input class="form-check-input" type="radio" name="pick" ' + (b.id === selId ? "checked" : "") + (el.ok ? "" : " disabled") + ' aria-label="Select"></td><td><b>' + h(b.name) +
          '</b></td><td>' + h(b.relation) + "</td><td>" + HMS.age(b.dob) + " / " + h((b.gender || "")[0] || "") + '</td><td class="mono">' + h(b.regnNo || "—") + "</td><td>" + HMS.svc.statusChip(b) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    $("#family tbody").onclick = (ev) => { const tr = ev.target.closest("[data-id]"); if (tr) selectBen(Number(tr.dataset.id)); };
    if (selId) selectBen(selId);
  }
  function selectBen(id) {
    const b = HMS.svc.beneficiary(id), el = O.eligibility(b);
    if (!el.ok) return HMS.toast(el.reason, "danger");
    ben = b;
    HMS.$$("#family tr[data-id]").forEach((tr) => { const on = Number(tr.dataset.id) === id; tr.classList.toggle("selected", on); tr.querySelector("input").checked = on; });
    $("#visitForm").hidden = false;
    $("#benInfo").innerHTML = '<div class="note ' + (el.emergencyOnly ? "note-warn" : "note-ok") + '"><i class="bi bi-' + (el.emergencyOnly ? "exclamation-triangle" : "check-circle") + '"></i><div><b>' + h(b.name) + "</b> · " + h(b.relation) + " of " + h(b.empCode) +
      (b.regnNo ? ' · Regn. No. <span class="mono">' + h(b.regnNo) + "</span>" : "") + (b.allergies ? ' · <span class="text-danger fw-semibold">Allergy: ' + h(b.allergies) + "</span>" : "") +
      (el.emergencyOnly ? "<br>" + h(el.reason) : "<br>Verified · valid upto " + h(HMS.fmtDate(b.validUpto))) + "</div></div>";
    if (el.emergencyOnly) { $("#visitType").value = "emergency"; $("#priority").value = "emergency"; }
    $("#visitType").disabled = $("#priority").disabled = !!el.emergencyOnly;
    const emp = HMS.svc.employee(b.empCode) || {};
    $("#phone").value = b.mobile || (b.relation === "Self" ? emp.mobile : "") || "";
    const age = HMS.age(b.dob);
    if (age < 14 && O.doctors("Paediatrics").length) $("#department").value = "Paediatrics";
    fillDoctors();
    $("#complaint").focus();
  }

  // ---------- token (vouchers print after the consultation) ----------
  function showToken(v) {
    const b = HMS.svc.beneficiary(v.benId), doc = S.find("users", (u) => u.username === v.doctor) || {};
    $("#formCard").hidden = true; $("#tokenCard").hidden = false;
    $("#tokenNo").textContent = v.token;
    $("#tokenWho").textContent = b.name + " · " + b.relation + " of " + v.empCode;
    $("#tokenWhere").textContent = (doc.name || v.doctor) + " · " + v.department + (doc.room ? " · Room " + doc.room : "") + (v.visitType === "emergency" ? " · EMERGENCY" : "");
  }
  function resetForm() {
    ben = null; $("#visitForm").reset(); $("#visitForm").hidden = true; $("#family").innerHTML = ""; $("#q").value = "";
    $("#visitType").disabled = $("#priority").disabled = false;
    $("#formCard").hidden = false; $("#tokenCard").hidden = true; $("#q").focus(); fillDoctors();
  }

  // ---------- today's register ----------
  function renderRegister() {
    const today = HMS.todayISO();
    const list = S.filter("visits", (v) => v.date === today).sort((a, b) => b.token - a.token);
    $("#regDate").textContent = HMS.fmtDate(today);
    $("#regCount").textContent = list.filter((v) => v.status !== "cancelled").length + " visits";
    $("#tokenHint").textContent = "Next token " + ((S.db.counters["tok" + today.replace(/-/g, "")] || 0) + 1);
    $("#register").innerHTML = list.length ? list.map((v) => {
      const b = HMS.svc.beneficiary(v.benId) || {};
      return "<tr><td><b>" + v.token + "</b>" + (v.priority !== "normal" ? ' <i class="bi bi-exclamation-circle-fill text-danger" title="' + h(v.priority) + '"></i>' : "") + "</td><td><b>" + h(b.name) + '</b><div class="small text-muted">' + h(b.relation) + " · " + h(v.empCode) +
        '</div></td><td class="small">' + h(O.doctorName(v.doctor)) + "</td><td>" + O.visitChip(v) + '</td><td class="text-end text-nowrap">' +
        (v.status === "completed" ? '<button class="btn btn-sm btn-light border" data-slip="' + v.id + '" title="Reprint vouchers"><i class="bi bi-printer"></i></button>' : "") +
        (["registered", "vitals_done"].includes(v.status) ? ' <button class="btn btn-sm btn-light border" data-cancel="' + v.id + '" title="Cancel visit"><i class="bi bi-x-lg"></i></button>' : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="5" class="empty"><i class="bi bi-inbox"></i>No visits yet today</td></tr>';
  }
  $("#register").onclick = async (e) => {
    const s = e.target.closest("[data-slip]"), c = e.target.closest("[data-cancel]");
    if (s) { try { HMS.vouchers.print(Number(s.dataset.slip)); } catch (err) { HMS.toast(err.message, "danger"); } }
    if (c) {
      const v = O.visit(Number(c.dataset.cancel));
      const ok = await HMS.confirm("Cancel token " + v.token + "?", '<label class="form-label" for="cancelReason">Reason</label><input class="form-control" id="cancelReason" placeholder="e.g. Patient left without consultation">', "Cancel visit", "btn-danger");
      if (!ok) return;
      try { O.cancelVisit(v.id, (document.getElementById("cancelReason") || {}).value || HMS._lastReason); HMS.toast("Visit cancelled", "warning"); renderRegister(); }
      catch (err) { HMS.toast(err.message, "danger"); }
    }
  };
  // keep the typed reason after the modal closes
  document.addEventListener("input", (e) => { if (e.target.id === "cancelReason") HMS._lastReason = e.target.value; });

  // ---------- events ----------
  $("#findForm").onsubmit = (e) => { e.preventDefault(); const q = HMS.clean($("#q").value); if (q) find(q); };
  $("#clearBtn").onclick = resetForm;
  $("#newVisitBtn").onclick = resetForm;
  $("#visitForm").onsubmit = (e) => {
    e.preventDefault();
    if (!ben) return HMS.toast("Select the patient first", "warning");
    try {
      const v = O.registerVisit({ benId: ben.id, department: $("#department").value, doctor: $("#doctor").value, visitType: $("#visitType").value, priority: $("#priority").value, complaint: $("#complaint").value, phone: $("#phone").value });
      HMS.toast("Token " + v.token + " issued – " + v.visitNo);
      renderRegister(); showToken(v);
    } catch (err) { HMS.toast(err.message, "danger"); }
  };

  fillDoctors(); renderRegister();
  const pre = Number(HMS.param("ben"));
  if (pre) { const b = HMS.svc.beneficiary(pre); if (b) { $("#q").value = b.empCode; showFamily(b.empCode, b.id); } }
})();
