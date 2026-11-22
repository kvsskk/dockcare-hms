/*
 * OPD vouchers – printed after the doctor completes the consultation.
 * One A4 sheet, three tear-off vouchers:
 *   Patient voucher – patient details, diagnosis, medicines with instructions, tests to give, follow-up
 *   Doctor voucher  – everything: details, vitals, diagnosis, notes, prescription, tests, signature
 *   Lab voucher     – only what the lab needs: patient, employee ID, phone, referring doctor, tests
 *                     (printed even when no test is ordered – the test area is left blank)
 */
(function (HMS) {
  "use strict";
  const { h } = HMS;
  const S = HMS.store;

  function ctx(visitId) {
    const O = HMS.opd;
    const v = O.visit(visitId);
    if (!v) throw new Error("Visit not found");
    const b = HMS.svc.beneficiary(v.benId) || {};
    const e = HMS.svc.employee(v.empCode) || {};
    const doc = S.find("users", (u) => u.username === v.doctor) || {};
    const rx = S.filter("rxItems", (r) => r.visitId === v.id).map((r) => Object.assign({ drug: O.drug(r.drugId) }, r));
    const lab = S.find("labOrders", (o) => o.visitId === v.id);
    const tests = lab ? lab.items.map((it) => O.test(it.testId)) : [];
    const phone = v.phone || b.mobile || e.mobile || "";
    return { v, b, e, doc, rx, lab, tests, phone, st: S.settings() };
  }

  function head(c, title, color) {
    return '<div class="vh"><i class="bi bi-life-preserver" style="font-size:6.5mm;color:#0E2A47"></i><div><b>' + h(c.st.hospitalName.toUpperCase()) +
      '</b><div class="vs">Out-Patient Department · ' + h(c.st.city) + "</div></div>" +
      (c.v.visitType === "emergency" ? '<b class="em">EMERGENCY</b>' : "") +
      '<div class="vt" style="background:' + color + '">' + title + "</div></div>";
  }

  /** Basic details shared by all three vouchers. */
  function basics(c, withQR) {
    const f = (l, val) => "<div><span>" + l + "</span><b>" + (val || "—") + "</b></div>";
    return '<div class="vrow"><div class="vgrid">' +
      f("OPD No.", h(c.v.visitNo)) + f("Date", h(HMS.fmtDateTime(c.v.consult && c.v.consult.completedAt || c.v.createdAt))) + f("Token", String(c.v.token)) +
      f("Patient name", h(c.b.name)) + f("Age / Gender", HMS.age(c.b.dob) + " Y / " + h(c.b.gender)) + f("Phone no.", h(c.phone)) +
      f("Referral employee ID", h(c.e.code) + " – " + h(c.e.name)) + f("Relation", h(c.b.relation)) + f("Regn. No.", h(c.b.regnNo || "Pending")) +
      "</div>" + (withQR ? '<div class="vqr">' + HMS.qrImg(c.v.visitNo, 52) + "</div>" : "") + "</div>";
  }

  function rxTable(c, full) {
    if (!c.rx.length) return '<div class="vsec"><b>Medicines:</b> None prescribed</div>';
    return '<table class="vtab"><tr><th>#</th><th>Medicine</th><th>Dosage</th><th>Days</th><th>Qty</th><th>Instruction</th></tr>' +
      c.rx.map((r, i) => "<tr><td>" + (i + 1) + "</td><td>" + h(r.drug.name) + "</td><td>" + h(r.dosage) + "</td><td>" + r.days + "</td><td>" + r.qty + "</td><td>" + h(r.instruction) + "</td></tr>").join("") + "</table>";
  }

  function testsBlock(c, blankLines) {
    if (c.tests.length) return '<div class="vsec"><b>Lab tests:</b> ' + c.tests.map((t) => h(t.name)).join(", ") + (c.lab && c.lab.priority === "urgent" ? ' <b class="em">URGENT</b>' : "") + "</div>";
    if (!blankLines) return '<div class="vsec"><b>Lab tests:</b> None ordered</div>';
    return '<div class="vsec"><b>Tests advised:</b></div><div class="vlines">' + "<div></div>".repeat(blankLines) + "</div>";
  }

  function followUp(c) {
    const d = c.v.consult && c.v.consult.followUpDays;
    return d ? HMS.fmtDate(HMS.addDays(c.v.date, d)) + " (after " + d + " days)" : "Not required";
  }

  function patientVoucher(c) {
    return '<div class="voucher">' + head(c, "PATIENT VOUCHER", "#0E8C7F") + basics(c, true) +
      '<div class="vsec"><b>Doctor:</b> ' + h(c.doc.name || c.v.doctor) + " · " + h(c.v.department) + " · <b>Diagnosis:</b> " + h((c.v.consult && c.v.consult.diagnosis || []).join(", ")) + "</div>" +
      rxTable(c) + testsBlock(c, 0) +
      '<div class="vsec"><b>Follow-up:</b> ' + h(followUp(c)) + "</div>" +
      '<div class="vfoot">Collect medicines from the hospital pharmacy' + (c.tests.length ? " and give samples at the laboratory" : "") + " with this voucher. Charges are recovered against employee ID " + h(c.e.code) + ".</div></div>";
  }

  function doctorVoucher(c) {
    const x = c.v.vitals;
    const vit = x ? "BP " + x.bpSys + "/" + x.bpDia + " mmHg · Pulse " + x.pulse + " · Temp " + x.temp + "°F" + (x.spo2 != null ? " · SpO₂ " + x.spo2 + "%" : "") +
      (x.weight ? " · Wt " + x.weight + " kg" : "") + (HMS.opd.bmi(x) ? " · BMI " + HMS.opd.bmi(x) : "") + (x.sugar ? " · RBS " + x.sugar : "") : "Not recorded";
    return '<div class="voucher">' + head(c, "DOCTOR VOUCHER", "#0E2A47") + basics(c, true) +
      '<div class="vsec"><b>Complaint:</b> ' + h(c.v.complaint || "—") + " · <b>Allergies:</b> " + h(c.b.allergies || "None known") + "</div>" +
      '<div class="vsec"><b>Vitals:</b> ' + h(vit) + "</div>" +
      '<div class="vsec"><b>Diagnosis:</b> ' + h((c.v.consult && c.v.consult.diagnosis || []).join(", ")) + (c.v.consult && c.v.consult.notes ? " · <b>Notes:</b> " + h(c.v.consult.notes) : "") + "</div>" +
      rxTable(c, true) + testsBlock(c, 0) +
      '<div class="vsign"><div><b>Follow-up:</b> ' + h(followUp(c)) + '</div><div class="sig">' + h(c.doc.name || c.v.doctor) + "<br>" + h(c.v.department) + (c.doc.room ? ", Room " + h(c.doc.room) : "") + "</div></div></div>";
  }

  function labVoucher(c) {
    const f = (l, val) => "<div><span>" + l + "</span><b>" + (val || "—") + "</b></div>";
    return '<div class="voucher">' + head(c, "LAB VOUCHER", "#B45309") +
      '<div class="vrow"><div class="vgrid">' +
      f("Lab order no.", h(c.lab ? c.lab.orderNo : "—")) + f("OPD No.", h(c.v.visitNo)) + f("Date", h(HMS.fmtDate(c.v.date))) +
      f("Patient name", h(c.b.name)) + f("Age / Gender", HMS.age(c.b.dob) + " Y / " + h(c.b.gender)) + f("Phone no.", h(c.phone)) +
      f("Referral employee ID", h(c.e.code)) + f("Referred by", h(c.doc.name || c.v.doctor)) + f("Priority", c.lab && c.lab.priority === "urgent" ? '<span class="em">URGENT</span>' : "Normal") +
      "</div>" + (c.lab ? '<div class="vqr">' + HMS.qrImg(c.lab.orderNo, 52) + "</div>" : "") + "</div>" +
      (c.tests.length ? '<table class="vtab"><tr><th>#</th><th>Test</th><th>Sample</th><th>Collected (time / sign)</th></tr>' +
        c.tests.map((t, i) => "<tr><td>" + (i + 1) + "</td><td>" + h(t.name) + "</td><td>" + h(t.sample) + "</td><td></td></tr>").join("") + "</table>"
        : testsBlock(c, 4)) +
      '<div class="vsign"><div>Sample collected at: ____________</div><div class="sig">Lab Technician</div></div></div>';
  }

  HMS.vouchers = {
    html(visitId) {
      const c = ctx(visitId);
      if (c.v.status !== "completed") throw new Error("Vouchers are printed after the doctor completes the consultation");
      return '<div class="voucher-sheet">' + patientVoucher(c) + doctorVoucher(c) + labVoucher(c) + "</div>";
    },
    print(visitId) {
      const html = HMS.vouchers.html(visitId);
      const v = HMS.opd.visit(visitId);
      const n = v.voucherPrints || 0;
      S.update("visits", v.id, { voucherPrints: n + 1, voucherPrintedAt: HMS.nowISO() });
      HMS.svc.audit(n ? "Vouchers reprinted" : "Vouchers printed", "visit", v.visitNo, "Patient, doctor and lab vouchers" + (n ? " (copy " + (n + 1) + ")" : ""));
      HMS.printHTML(html);
    },
  };
})(window.HMS);
