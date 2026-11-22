(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("approvals");
  HMS.layout.render({ page: "approvals", title: "Dependent Approvals", crumb: "Beneficiaries" });
  if (!HMS.auth.can("approvals")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store;
  const TABS = [["pending", "Pending", (b) => b.status === "pending" || b.status === "review"], ["returned", "Returned", (b) => b.status === "returned"],
    ["approved", "Approved (30 days)", (b) => b.status === "active" && b.approvedAt && Date.now() - new Date(b.approvedAt) < 30 * 864e5],
    ["rejected", "Rejected", (b) => b.status === "rejected"]];
  let tab = HMS.param("tab") || "pending", selId = Number(HMS.param("id")) || null;

  const approver = S.settings().approverRole === "hr" ? "HR" : "Hospital Admin";
  $("#approverNote").innerHTML = HMS.svc.canApprove() ? "" :
    '<div class="note note-info mb-3"><i class="bi bi-info-circle"></i><div>Dependents are approved by <b>' + approver + "</b> (set in Settings). You can view requests but not approve them.</div></div>";

  function summary(b) {
    const c = HMS.svc.checkEligibility(b, { ignoreId: b.id });
    const e = c.filter((x) => x.level === "err").length, w = c.filter((x) => x.level === "warn").length;
    return e ? '<span class="chip chip-red">' + e + " error" + (e > 1 ? "s" : "") + "</span>" : w ? '<span class="chip chip-amber">' + w + " flag" + (w > 1 ? "s" : "") + "</span>" : '<span class="chip chip-green">All checks OK</span>';
  }

  function renderList() {
    $("#tabs").innerHTML = TABS.map((t) => '<li class="nav-item"><a class="nav-link' + (t[0] === tab ? " active" : "") + '" href="#" data-tab="' + t[0] + '">' + t[1] +
      ' <span class="badge text-bg-light">' + S.filter("beneficiaries", t[2]).length + "</span></a></li>").join("");
    const rows = S.filter("beneficiaries", TABS.find((t) => t[0] === tab)[2]).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    $("#list").innerHTML = rows.length ? rows.map((b) => {
      const e = HMS.svc.employee(b.empCode);
      return '<tr class="clickable' + (b.id === selId ? " selected" : "") + '" data-id="' + b.id + '"><td><b>' + h(b.name) + '</b><div class="small text-muted">' + h(b.relation) + (b.source === "import" ? " · imported" : "") +
        '</div></td><td><span class="mono">' + h(b.empCode) + '</span><div class="small text-muted">' + h(e ? e.name : "") + '</div></td><td class="small text-muted">' + h(HMS.fmtDateTime(b.createdAt)) + "</td><td>" + summary(b) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty"><i class="bi bi-inbox"></i>Nothing here</td></tr>';
  }

  function renderDetail() {
    const b = selId && HMS.svc.beneficiary(selId);
    if (!b) { $("#detail").innerHTML = '<div class="empty"><i class="bi bi-hand-index"></i>Select a request</div>'; return; }
    const e = HMS.svc.employee(b.empCode) || {};
    const checks = HMS.svc.checkEligibility(b, { ignoreId: b.id });
    const icon = { ok: "check-circle-fill text-success", warn: "exclamation-triangle-fill text-warning", err: "x-circle-fill text-danger" };
    const cls = { ok: "note-ok", warn: "note-warn", err: "note-err" };
    const waiting = b.status === "pending" || b.status === "review";
    const canAct = waiting && HMS.svc.canApprove();
    const f = (l, v) => '<div class="col-sm-3"><div class="small text-muted">' + l + '</div><div class="fw-semibold">' + (v || "—") + "</div></div>";
    const hist = (b.history || []).slice().reverse().map((x) => '<div class="d-flex gap-2 py-1"><i class="bi bi-dot text-success"></i><div><b>' + h(x.action) + '</b> <span class="small text-muted">' + h(HMS.fmtDateTime(x.at)) + " · " + h(x.by) + "</span>" + (x.remarks ? '<div class="small">' + h(x.remarks) + "</div>" : "") + "</div></div>").join("");
    $("#detail").innerHTML =
      '<div class="card-header">' + (b.photo ? '<img src="' + b.photo + '" alt="" style="width:42px;height:50px;object-fit:cover;border-radius:6px">' : '<div class="avatar" style="width:42px;height:42px">' + h(HMS.initials(b.name)) + "</div>") +
      '<div><h3>' + h(b.name) + '</h3><div class="sub">' + h(b.relation) + " of " + h(e.name || "") + ' (<span class="mono">' + h(b.empCode) + "</span>) · requested by " + h(b.createdBy) + '</div></div><span class="ms-auto">' + HMS.svc.statusChip(b) + "</span></div>" +
      '<div class="card-body border-bottom"><div class="row g-3">' + f("Date of birth", h(HMS.fmtDate(b.dob)) + " (" + HMS.age(b.dob) + ")") + f("Gender / Blood", h(b.gender) + " · " + h(b.bloodGroup || "–")) +
      f("Aadhaar", h(HMS.maskAadhaar(b.aadhaar))) + f("Declared income", b.income != null ? h(HMS.fmtMoney(b.income)) : "") + f("Identification marks", h(b.idMarks)) + f("Old book no.", h(b.oldBookNo)) +
      '<div class="col-sm-6"><div class="small text-muted">Address</div><div class="fw-semibold">' + (h(b.address) || "—") + "</div></div></div></div>" +
      '<div class="card-body border-bottom"><div class="fw-semibold mb-2">Documents</div>' +
      ((b.documents || []).length ? b.documents.map((d) => '<span class="chip chip-grey me-1 mb-1"><i class="bi bi-file-earmark-text"></i>' + h(d.name) + "</span>").join("") : '<span class="chip chip-amber">No documents attached</span>') +
      (b.signature ? '<div class="mt-2"><div class="small text-muted">Signature / LTI</div><img src="' + b.signature + '" alt="Signature" style="height:50px;border:1px solid var(--line);border-radius:6px;background:#fff"></div>' : "") + "</div>" +
      '<div class="card-body border-bottom"><div class="fw-semibold mb-2">System verification</div><div class="row g-2">' +
      checks.map((c) => '<div class="col-md-6"><div class="note ' + cls[c.level] + ' py-2"><i class="bi bi-' + icon[c.level] + '"></i><div><b>' + h(c.title) + '</b><div class="small">' + h(c.detail) + "</div></div></div></div>").join("") + "</div></div>" +
      (canAct ? '<div class="card-body border-bottom"><div class="row g-3"><div class="col-md-8"><label class="form-label" for="remarks">Remarks</label><textarea class="form-control" id="remarks" rows="2" placeholder="Required when returning or rejecting"></textarea></div>' +
        '<div class="col-md-4"><label class="form-label" for="validUpto">Valid upto</label><input class="form-control" type="date" id="validUpto" value="' + HMS.svc.defaultValidUpto() + '"></div></div></div>' +
        '<div class="card-body d-flex gap-2 justify-content-end flex-wrap"><button class="btn btn-outline-danger" data-act="rejected">Reject</button><button class="btn btn-light border" data-act="returned">Send back for correction</button>' +
        '<button class="btn btn-primary" data-act="active"' + (checks.some((c) => c.level === "err") ? " disabled title=\"Resolve errors first\"" : "") + '><i class="bi bi-check2 me-1"></i>Approve &amp; generate Regn. No.</button></div>' : "") +
      (b.regnNo ? '<div class="card-body border-bottom"><div class="note note-ok"><i class="bi bi-person-vcard"></i><div>Regn. No. <b class="mono">' + h(b.regnNo) + "</b> · valid upto " + h(HMS.fmtDate(b.validUpto)) +
        (HMS.auth.can("cards") ? ' · <a href="cards.html?id=' + b.id + '">Print card</a>' : "") + "</div></div></div>" : "") +
      (hist ? '<div class="card-body"><div class="fw-semibold mb-1">History</div>' + hist + "</div>" : "");

    HMS.$$("#detail [data-act]").forEach((btn) => btn.onclick = async () => {
      const act = btn.dataset.act, remarks = $("#remarks").value;
      if (act !== "active" && !HMS.clean(remarks)) { $("#remarks").classList.add("is-invalid"); return HMS.toast("Enter remarks before returning or rejecting", "warning"); }
      if (act === "rejected" && !(await HMS.confirm("Reject this dependent?", "<p>" + h(b.name) + " will not be eligible for treatment. This is recorded in the audit log.</p>", "Reject", "btn-danger"))) return;
      try {
        const r = HMS.svc.decide(b.id, act, remarks, $("#validUpto").value || HMS.svc.defaultValidUpto());
        HMS.toast(act === "active" ? "Approved – Regn. No. " + r.regnNo : act === "returned" ? "Sent back to reception" : "Request rejected", act === "rejected" ? "warning" : "success");
        renderList(); renderDetail();
      } catch (err) { HMS.toast(err.message, "danger"); }
    });
  }

  $("#tabs").onclick = (e) => { const a = e.target.closest("[data-tab]"); if (!a) return; e.preventDefault(); tab = a.dataset.tab; selId = null; renderList(); renderDetail(); };
  $("#list").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (!tr) return; selId = Number(tr.dataset.id); renderList(); renderDetail(); };
  if (!selId) { const first = S.filter("beneficiaries", TABS.find((t) => t[0] === tab)[2]).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]; selId = first ? first.id : null; }
  renderList(); renderDetail();
})();
