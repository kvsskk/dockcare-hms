(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("lab");
  HMS.layout.render({ page: "lab", title: "Laboratory Worklist", crumb: "Laboratory" });
  if (!HMS.auth.can("lab")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, O = HMS.opd, st = S.settings();
  const t0 = () => HMS.todayISO();
  const TABS = [["ordered", "Sample due", (o) => o.status === "ordered"], ["collected", "In process", (o) => o.status === "collected"],
    ["released", "Released today", (o) => o.status === "released" && HMS.localISO(new Date(o.releasedAt)) === t0()]];
  let tab = "ordered", selId = null;

  const rows = (fn) => S.filter("labOrders", fn).sort((a, b) => (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1) || a.orderedAt.localeCompare(b.orderedAt));

  function renderKpis() {
    const today = S.filter("labOrders", (o) => HMS.localISO(new Date(o.orderedAt)) === t0());
    const k = (icon, l, v, d) => '<div class="col-sm-6 col-xl-3"><div class="card kpi p-3 h-100"><div class="l"><i class="bi bi-' + icon + '"></i>' + l + '</div><div class="v">' + v + '</div><div class="d">' + d + "</div></div></div>";
    $("#kpis").innerHTML = k("file-earmark-medical", "Orders today", today.length, today.reduce((n, o) => n + o.items.length, 0) + " tests") +
      k("droplet", "Samples due", rows(TABS[0][2]).length, "At collection counter") + k("hourglass-split", "In process", rows(TABS[1][2]).length, "Results being entered") +
      k("check2-circle", "Released today", rows(TABS[2][2]).length, "Visible to doctors immediately");
  }
  function renderList() {
    $("#tabs").innerHTML = TABS.map((t) => '<li class="nav-item"><a class="nav-link' + (t[0] === tab ? " active" : "") + '" href="#" data-tab="' + t[0] + '">' + t[1] + ' <span class="badge text-bg-light">' + rows(t[2]).length + "</span></a></li>").join("");
    const list = rows(TABS.find((t) => t[0] === tab)[2]);
    $("#list").innerHTML = list.length ? list.map((o) => { const b = HMS.svc.beneficiary(o.benId);
      return '<tr class="clickable' + (o.id === selId ? " selected" : "") + '" data-id="' + o.id + '"><td class="mono">' + h(o.orderNo) + (o.priority === "urgent" ? '<br><span class="chip chip-red">Urgent</span>' : "") + "</td><td><b>" + h(b.name) +
        '</b><div class="small text-muted">' + o.items.map((it) => h(O.test(it.testId).code)).join(", ") + " · " + h(HMS.fmtTime(o.orderedAt)) + "</div></td><td>" + O.labChip(o) + "</td></tr>"; }).join("")
      : '<tr><td colspan="3" class="empty"><i class="bi bi-inbox"></i>Nothing here</td></tr>';
  }

  function reportHTML(o) {
    const b = HMS.svc.beneficiary(o.benId), v = O.visit(o.visitId), e = HMS.svc.employee(o.empCode) || {};
    return '<div class="report-sheet"><div style="display:flex;align-items:center;gap:4mm;border-bottom:.6mm solid #0E2A47;padding-bottom:3mm"><i class="bi bi-life-preserver" style="font-size:9mm;color:#0E2A47"></i><div><b style="font-size:14pt">' + h(st.hospitalName.toUpperCase()) +
      '</b><div style="font-size:9pt;color:#556">Laboratory report · ' + h(st.city) + '</div></div><div style="margin-left:auto;text-align:right;font-size:9pt">Order <b>' + h(o.orderNo) + "</b><br>" + h(v.visitNo) + "</div></div>" +
      '<table style="margin:3mm 0;font-size:9.5pt"><tr><td><b>Patient</b> ' + h(b.name) + "</td><td><b>Age / Sex</b> " + HMS.age(b.dob) + " / " + h(b.gender) + "</td><td><b>Regn. No.</b> " + h(b.regnNo || "–") + "</td></tr><tr><td><b>Employee</b> " + h(e.code) + " · " + h(e.name) +
      "</td><td><b>Referred by</b> " + h(O.doctorName(o.orderedBy)) + "</td><td><b>Collected</b> " + h(HMS.fmtDateTime(o.collectedAt)) + "</td></tr></table>" +
      o.items.map((it) => { const t = O.test(it.testId); return '<div style="margin-top:4mm;font-weight:700">' + h(t.name) + ' <span style="font-weight:400;color:#556">(' + h(t.sample) + ")</span></div><table><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr>" +
        t.params.map((p, k) => "<tr><td>" + h(p.n) + '</td><td class="flag-' + h(it.flags[k]) + '"><b>' + h(it.values[k]) + "</b></td><td>" + h(p.u) + "</td><td>" + h(p.normal || (p.lo + " – " + p.hi)) + "</td><td>" + (it.flags[k] && it.flags[k] !== "N" ? "<b>" + it.flags[k] + "</b>" : "") + "</td></tr>").join("") + "</table>"; }).join("") +
      '<div style="margin-top:10mm;display:flex;justify-content:space-between;font-size:9pt"><div>Released ' + h(HMS.fmtDateTime(o.releasedAt)) + '</div><div style="text-align:center;border-top:.2mm solid #555;padding-top:1mm;width:55mm">' + h(O.doctorName(o.releasedBy)) + "<br>Lab Technician</div></div>" +
      '<div style="margin-top:4mm;font-size:8pt;color:#667385">L = below, H = above reference range, A = abnormal. Please consult the referring doctor.</div></div>';
  }

  function renderDetail() {
    const o = selId && S.get("labOrders", selId);
    if (!o) { $("#detail").innerHTML = '<div class="empty"><i class="bi bi-hand-index"></i>Select an order</div>'; return; }
    const b = HMS.svc.beneficiary(o.benId), v = O.visit(o.visitId);
    const editable = o.status === "collected";
    const amt = o.items.reduce((s, it) => s + O.test(it.testId).rate, 0);
    $("#detail").innerHTML =
      '<div class="card-header"><div><h3>' + h(o.orderNo) + " · " + h(b.name) + '</h3><div class="sub">' + HMS.age(b.dob) + " Y / " + h(b.gender) + " · " + h(b.relation) + " of " + h(o.empCode) + " · ordered by " + h(O.doctorName(o.orderedBy)) + " · " + h(HMS.fmtDateTime(o.orderedAt)) +
      '</div></div><span class="ms-auto">' + O.labChip(o) + (o.priority === "urgent" ? ' <span class="chip chip-red">Urgent</span>' : "") + "</span></div>" +
      (o.status === "ordered" ? '<div class="card-body"><div class="note note-info mb-3"><i class="bi bi-droplet"></i><div>Collect: ' + o.items.map((it) => h(O.test(it.testId).name) + " (" + h(O.test(it.testId).sample) + ")").join(", ") +
        '</div></div><button class="btn btn-primary" id="collectBtn"><i class="bi bi-check2 me-1"></i>Mark sample collected</button></div>' :
        '<form id="resForm" novalidate>' + o.items.map((it, i) => { const t = O.test(it.testId);
          return '<div class="card-body border-top"><div class="fw-semibold mb-2">' + h(t.name) + ' <span class="text-muted small">' + h(t.sample) + " · " + HMS.fmtMoney(t.rate) + '</span></div><div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Parameter</th><th style="width:160px">Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead><tbody>' +
            t.params.map((p, k) => { const val = it.values ? it.values[k] : null;
              const input = p.normal ? '<input class="form-control form-control-sm" data-i="' + i + '" data-k="' + k + '" list="txt' + i + "_" + k + '" value="' + h(val ?? "") + '"' + (editable ? "" : " disabled") + '><datalist id="txt' + i + "_" + k + '"><option>' + h(p.normal) + "</option><option>Positive</option><option>Trace</option><option>+</option><option>++</option></datalist>"
                : '<input class="form-control form-control-sm" type="number" step="any" data-i="' + i + '" data-k="' + k + '" value="' + h(val ?? "") + '"' + (editable ? "" : " disabled") + ">";
              return "<tr><td>" + h(p.n) + "</td><td>" + input + '</td><td class="text-muted">' + h(p.u) + '</td><td class="text-muted">' + h(p.normal || p.lo + " – " + p.hi) + '</td><td data-flag="' + i + "_" + k + '"></td></tr>'; }).join("") + "</tbody></table></div></div>"; }).join("") +
        '<div class="card-body border-top" id="abn"></div><div class="card-body border-top d-flex gap-2 align-items-center flex-wrap"><span class="text-muted small">Charges ' + HMS.fmtMoney(amt) + " posted to " + h(o.empCode) + " on release</span>" +
        (editable ? '<button type="button" class="btn btn-light border ms-auto" id="saveBtn">Save</button><button type="submit" class="btn btn-primary"><i class="bi bi-check2-circle me-1"></i>Verify &amp; release</button>'
          : '<span class="ms-auto text-muted small">Released ' + h(HMS.fmtDateTime(o.releasedAt)) + '</span><button type="button" class="btn btn-light border" id="printBtn"><i class="bi bi-printer me-1"></i>Print report</button>') + "</div></form>");

    const values = () => o.items.map((it, i) => O.test(it.testId).params.map((p, k) => { const el = document.querySelector('[data-i="' + i + '"][data-k="' + k + '"]'); return el ? el.value : null; }));
    const flags = () => {
      let abn = 0;
      o.items.forEach((it, i) => O.test(it.testId).params.forEach((p, k) => {
        const el = document.querySelector('[data-i="' + i + '"][data-k="' + k + '"]'); if (!el) return;
        const f = HMS.labFlag(p, el.value === "" ? null : el.value);
        document.querySelector('[data-flag="' + i + "_" + k + '"]').innerHTML = f === "L" ? '<span class="chip chip-red">Low</span>' : f === "H" ? '<span class="chip chip-red">High</span>' : f === "A" ? '<span class="chip chip-red">Abnormal</span>' : f === "N" ? '<span class="chip chip-green">Normal</span>' : "";
        el.classList.toggle("is-invalid", f && f !== "N"); if (f && f !== "N") abn++;
      }));
      const ab = $("#abn"); if (ab) ab.innerHTML = abn ? '<div class="note note-warn"><i class="bi bi-exclamation-triangle"></i><div>' + abn + " value(s) outside the reference range. The doctor sees these flagged on release.</div></div>" : '<span class="text-muted small">All entered values are within range.</span>';
    };
    if ($("#collectBtn")) $("#collectBtn").onclick = () => { try { O.collectSample(o.id); HMS.toast("Sample collected – " + o.orderNo); tab = "collected"; refresh(); } catch (err) { HMS.toast(err.message, "danger"); } };
    if ($("#resForm")) {
      flags();
      $("#resForm").addEventListener("input", flags);
      if ($("#saveBtn")) $("#saveBtn").onclick = () => { try { O.saveResults(o.id, values()); HMS.toast("Results saved"); } catch (err) { HMS.toast(err.message, "danger"); } };
      $("#resForm").onsubmit = async (e) => {
        e.preventDefault();
        try {
          O.saveResults(o.id, values());
          if (!(await HMS.confirm("Release report " + o.orderNo + "?", "<p>The report becomes visible to the doctor and cannot be changed afterwards. " + HMS.fmtMoney(amt) + " is charged to employee code <b>" + h(o.empCode) + "</b>.</p>", "Release"))) return;
          O.releaseReport(o.id); HMS.toast("Report released – " + o.orderNo); refresh();
        } catch (err) { HMS.toast(err.message, "danger"); }
      };
      if ($("#printBtn")) $("#printBtn").onclick = () => HMS.printHTML(reportHTML(S.get("labOrders", o.id)));
    }
  }

  function refresh() { renderKpis(); renderList(); renderDetail(); }
  $("#tabs").onclick = (e) => { const a = e.target.closest("[data-tab]"); if (!a) return; e.preventDefault(); tab = a.dataset.tab; selId = (rows(TABS.find((t) => t[0] === tab)[2])[0] || {}).id || null; refresh(); };
  $("#list").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (!tr) return; selId = Number(tr.dataset.id); renderList(); renderDetail(); };
  selId = (rows(TABS[0][2])[0] || {}).id || null;
  refresh();
  setInterval(() => { if (!document.querySelector("#resForm:focus-within")) { renderKpis(); renderList(); } }, 20000);
})();
