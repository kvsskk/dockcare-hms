/*
 * OPD business rules: visit registration and tokens, vitals, consultation, laboratory,
 * pharmacy dispensing (earliest expiry first) and charges posted against the employee code.
 * The same rules move to the Node.js server / database functions when Supabase is connected.
 */
(function (HMS) {
  "use strict";
  const S = HMS.store;
  const user = () => HMS.auth.current() || { username: "system", name: "System", role: "system" };
  const VSTATUS = { registered: ["Waiting", "chip-grey"], vitals_done: ["Vitals done", "chip-blue"], in_consultation: ["With doctor", "chip-amber"],
    completed: ["Completed", "chip-green"], cancelled: ["Cancelled", "chip-red"] };
  const LSTATUS = { ordered: ["Sample due", "chip-amber"], collected: ["In process", "chip-blue"], released: ["Released", "chip-green"] };

  function fail(msg) { throw new Error(msg); }
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  const opd = {
    VSTATUS, LSTATUS,
    visitChip(v) { const s = VSTATUS[v.status] || [v.status, "chip-grey"]; return '<span class="chip ' + s[1] + '">' + s[0] + "</span>"; },
    labChip(o) { const s = LSTATUS[o.status] || [o.status, "chip-grey"]; return '<span class="chip ' + s[1] + '">' + s[0] + "</span>"; },

    departments() { return S.settings().departments; },
    fee(dep) { return (opd.departments().find((d) => d.name === dep) || { fee: 0 }).fee; },
    doctors(dep) { return S.filter("users", (u) => u.role === "doctor" && u.active && (!dep || u.department === dep)); },
    doctorName(username) { const u = S.find("users", (x) => x.username === username); return u ? u.name : username; },
    visit(id) { return S.get("visits", id); },
    ben(v) { return HMS.svc.beneficiary(v.benId); },
    waitingFor(doctor) { return S.filter("visits", (v) => v.date === HMS.todayISO() && v.doctor === doctor && ["registered", "vitals_done", "in_consultation"].includes(v.status)).length; },

    /** Can this beneficiary be seen today? */
    eligibility(b) {
      if (!b) return { ok: false, reason: "Beneficiary not found" };
      const e = HMS.svc.employee(b.empCode);
      if (!e || e.status !== "active") return { ok: false, reason: "Employee " + b.empCode + " is not active in the HR master" };
      const st = HMS.svc.effectiveStatus(b);
      if (st === "active") return { ok: true };
      if (["pending", "review", "returned"].includes(st)) return { ok: true, emergencyOnly: true, reason: "Dependent not yet approved – emergency visit only. Charges are held until approval." };
      if (st === "expired") return { ok: true, emergencyOnly: true, reason: "Card validity ended on " + HMS.fmtDate(b.validUpto) + " – emergency visit only until renewed." };
      return { ok: false, reason: "Beneficiary status is " + st + " – not eligible for treatment" };
    },

    registerVisit(d) {
      const u = user();
      const b = HMS.svc.beneficiary(d.benId);
      const el = opd.eligibility(b);
      if (!el.ok) fail(el.reason);
      if (!d.department) fail("Select the department");
      if (!d.doctor) fail("Select the doctor");
      const today = HMS.todayISO();
      const open = S.find("visits", (v) => v.benId === b.id && v.date === today && v.department === d.department && !["completed", "cancelled"].includes(v.status));
      if (open) fail(b.name + " already has an open visit today in " + d.department + " (token " + open.token + ")");
      const phone = String(d.phone || "").replace(/\D/g, "");
      if (phone && !/^[6-9]\d{9}$/.test(phone)) fail("Phone number must be a 10-digit mobile number");
      const emergency = el.emergencyOnly || d.visitType === "emergency";
      const token = S.counter("tok" + today.replace(/-/g, ""));
      const v = S.insert("visits", {
        visitNo: "OP-" + today.slice(2).replace(/-/g, "") + "-" + String(token).padStart(4, "0"), benId: b.id, empCode: b.empCode, date: today, token,
        department: d.department, doctor: d.doctor, visitType: emergency ? "emergency" : d.visitType || "fresh", priority: emergency ? "emergency" : d.priority || "normal",
        complaint: HMS.clean(d.complaint), phone: String(d.phone || "").replace(/\D/g, "") || b.mobile || "", status: "registered", createdAt: HMS.nowISO(), createdBy: u.username, vitals: null, consult: null, held: !!el.emergencyOnly && HMS.svc.effectiveStatus(b) !== "expired",
      });
      if (phone && !b.mobile) S.update("beneficiaries", b.id, { mobile: phone }); // remember the patient's number
      HMS.svc.audit("OPD visit registered", "visit", v.visitNo, b.name + " · " + b.empCode + " · token " + token + " · " + opd.doctorName(d.doctor) + (emergency ? " · EMERGENCY" : ""));
      return v;
    },

    cancelVisit(id, reason) {
      const v = opd.visit(id);
      if (!v || !["registered", "vitals_done"].includes(v.status)) fail("Only visits not yet seen by the doctor can be cancelled");
      if (!HMS.clean(reason)) fail("Enter the reason for cancelling");
      S.update("visits", id, { status: "cancelled", cancelReason: HMS.clean(reason), cancelledAt: HMS.nowISO(), cancelledBy: user().username });
      HMS.svc.audit("OPD visit cancelled", "visit", v.visitNo, reason);
    },

    saveVitals(id, x) {
      const v = opd.visit(id);
      if (!v || ["completed", "cancelled"].includes(v.status)) fail("This visit is closed");
      const vit = { bpSys: num(x.bpSys), bpDia: num(x.bpDia), pulse: num(x.pulse), temp: num(x.temp), spo2: num(x.spo2), weight: num(x.weight), height: num(x.height),
        sugar: num(x.sugar), triage: x.triage || "normal", notes: HMS.clean(x.notes), by: user().username, at: HMS.nowISO() };
      const range = [["bpSys", 60, 260, "Systolic BP"], ["bpDia", 30, 160, "Diastolic BP"], ["pulse", 30, 220, "Pulse"], ["temp", 92, 108, "Temperature"], ["spo2", 50, 100, "SpO₂"], ["weight", 1, 250, "Weight"], ["height", 30, 230, "Height"], ["sugar", 20, 700, "Blood sugar"]];
      range.forEach(([k, lo, hi, l]) => { if (vit[k] !== null && (isNaN(vit[k]) || vit[k] < lo || vit[k] > hi)) fail(l + " looks wrong (" + x[k] + ")"); });
      if (vit.bpSys === null || vit.pulse === null || vit.temp === null) fail("BP, pulse and temperature are required");
      const patch = { vitals: vit, priority: vit.triage === "normal" ? v.priority : vit.triage };
      if (v.status === "registered") patch.status = "vitals_done";
      S.update("visits", id, patch);
      if (x.allergies !== undefined) S.update("beneficiaries", v.benId, { allergies: HMS.clean(x.allergies) });
      HMS.svc.audit("Vitals recorded", "visit", v.visitNo, "BP " + vit.bpSys + "/" + vit.bpDia + ", T " + vit.temp + "°F");
    },
    bmi(vit) { return vit && vit.weight && vit.height ? +(vit.weight / Math.pow(vit.height / 100, 2)).toFixed(1) : null; },

    startConsult(id) {
      const v = opd.visit(id);
      if (v && ["registered", "vitals_done"].includes(v.status)) {
        S.update("visits", id, { status: "in_consultation", consult: Object.assign({}, v.consult || {}, { startedAt: HMS.nowISO(), by: user().username }) });
      }
    },

    /** Complete a consultation: saves notes, posts the consultation charge, sends prescription to pharmacy and orders to lab. */
    completeConsult(id, c) {
      const u = user();
      const v = opd.visit(id);
      if (!v || ["completed", "cancelled"].includes(v.status)) fail("This visit is already closed");
      const diagnosis = (c.diagnosis || []).map(HMS.clean).filter(Boolean);
      if (!diagnosis.length) fail("Enter at least one diagnosis");
      (c.rx || []).forEach((it) => {
        if (!S.get("drugs", it.drugId)) fail("Unknown medicine in prescription");
        if (!(it.qty > 0)) fail("Quantity must be more than zero for " + S.get("drugs", it.drugId).name);
      });
      const b = opd.ben(v);
      S.update("visits", id, { status: "completed", consult: { diagnosis, notes: HMS.clean(c.notes), followUpDays: c.followUpDays || null, by: u.username,
        startedAt: (v.consult && v.consult.startedAt) || HMS.nowISO(), completedAt: HMS.nowISO() } });
      opd.postCharge(v, "consultation", v.visitNo, "Consultation – " + v.department, opd.fee(v.department));
      (c.rx || []).forEach((it) => S.insert("rxItems", { visitId: v.id, benId: v.benId, drugId: it.drugId, dosage: it.dosage, instruction: it.instruction, days: it.days, qty: it.qty, qtyDispensed: 0, dispensedAt: null, dispensedBy: null }));
      let order = null;
      if ((c.labTests || []).length) {
        const n = S.counter("lab"); // continues from the last lab order number
        order = S.insert("labOrders", { orderNo: "LB-" + String(n).padStart(5, "0"), visitId: v.id, benId: v.benId, empCode: v.empCode, priority: c.labPriority || (v.priority === "normal" ? "normal" : "urgent"), status: "ordered",
          items: c.labTests.map((tid) => ({ testId: tid, values: null, flags: null })), orderedBy: u.username, orderedAt: HMS.nowISO(), collectedAt: null, releasedAt: null, releasedBy: null });
      }
      HMS.svc.audit("Consultation completed", "visit", v.visitNo, b.name + " · " + diagnosis.join(", ") + " · " + (c.rx || []).length + " medicines" + (order ? " · lab " + order.orderNo : ""));
      return { visit: opd.visit(id), order };
    },

    postCharge(v, source, ref, description, amount) {
      if (!(amount > 0)) return null;
      return S.insert("charges", { date: HMS.todayISO(), empCode: v.empCode, benId: v.benId, visitId: v.id, source, ref, description, amount: Math.round(amount * 100) / 100,
        held: !!v.held, createdAt: HMS.nowISO(), createdBy: user().username });
    },

    /** Previous completed visits of a beneficiary, newest first, with medicines and lab orders. */
    history(benId, excludeId) {
      return S.filter("visits", (v) => v.benId === benId && v.status === "completed" && v.id !== excludeId)
        .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
        .map((v) => ({ v, rx: S.filter("rxItems", (r) => r.visitId === v.id), labs: S.filter("labOrders", (o) => o.visitId === v.id) }));
    },

    // ---------- laboratory ----------
    test(id) { return S.get("labTests", id); },
    collectSample(id) {
      const o = S.get("labOrders", id);
      if (!o || o.status !== "ordered") fail("Sample already collected");
      S.update("labOrders", id, { status: "collected", collectedAt: HMS.nowISO(), collectedBy: user().username });
      HMS.svc.audit("Lab sample collected", "lab", o.orderNo, "");
    },
    saveResults(id, items) {
      const o = S.get("labOrders", id);
      if (!o || o.status === "released") fail("Report already released – results cannot be changed");
      if (o.status === "ordered") fail("Mark the sample as collected first");
      const out = o.items.map((it, i) => {
        const t = opd.test(it.testId);
        const values = t.params.map((p, k) => { const raw = items[i] && items[i][k]; return raw === "" || raw === undefined || raw === null ? null : p.normal ? String(raw).trim() : Number(raw); });
        values.forEach((val, k) => { if (val !== null && !t.params[k].normal && isNaN(val)) fail(t.params[k].n + ": enter a number"); });
        return { testId: it.testId, values, flags: t.params.map((p, k) => HMS.labFlag(p, values[k])) };
      });
      S.update("labOrders", id, { items: out, enteredBy: user().username, enteredAt: HMS.nowISO() });
      return S.get("labOrders", id);
    },
    releaseReport(id) {
      const o = S.get("labOrders", id);
      if (!o || o.status !== "collected") fail("Only collected samples can be released");
      const missing = [];
      o.items.forEach((it) => { const t = opd.test(it.testId); t.params.forEach((p, k) => { if (!it.values || it.values[k] === null || it.values[k] === undefined) missing.push(p.n); }); });
      if (missing.length) fail("Enter all results first: " + missing.slice(0, 4).join(", ") + (missing.length > 4 ? "…" : ""));
      S.update("labOrders", id, { status: "released", releasedAt: HMS.nowISO(), releasedBy: user().username });
      const v = opd.visit(o.visitId);
      const amt = o.items.reduce((s, it) => s + opd.test(it.testId).rate, 0);
      opd.postCharge(v, "lab", o.orderNo, "Lab – " + o.items.map((it) => opd.test(it.testId).code).join(", "), amt);
      const abn = o.items.reduce((n, it) => n + it.flags.filter((f) => f && f !== "N").length, 0);
      HMS.svc.audit("Lab report released", "lab", o.orderNo, (opd.ben(v) || {}).name + " · " + HMS.fmtMoney(amt) + (abn ? " · " + abn + " abnormal" : ""));
      return amt;
    },

    // ---------- pharmacy ----------
    drug(id) { return S.get("drugs", id); },
    /** Usable batches, earliest expiry first (expired batches are never issued). */
    batches(drugId) { const t = HMS.todayISO(); return S.filter("batches", (b) => b.drugId === drugId && b.qty > 0 && b.expiry > t).sort((a, b) => a.expiry.localeCompare(b.expiry) || a.id - b.id); },
    stock(drugId) { return opd.batches(drugId).reduce((s, b) => s + b.qty, 0); },
    pendingRx(visitId) { return S.filter("rxItems", (r) => r.visitId === visitId && r.qtyDispensed < r.qty); },

    /** Dispense several prescription lines. Everything is checked first, then stock, prescription and charges change together. */
    dispense(visitId, lines) {
      const u = user();
      const v = opd.visit(visitId);
      if (!v) fail("Visit not found");
      const plan = [];
      lines.filter((l) => l.qty > 0).forEach((l) => {
        const it = S.get("rxItems", l.rxItemId);
        if (!it || it.visitId !== visitId) fail("Prescription line not found");
        const d = opd.drug(it.drugId);
        if (!Number.isInteger(l.qty)) fail(d.name + ": quantity must be a whole number");
        if (it.qtyDispensed + l.qty > it.qty) fail(d.name + ": cannot dispense more than prescribed (" + (it.qty - it.qtyDispensed) + " left)");
        let left = l.qty; const take = [];
        opd.batches(it.drugId).forEach((b) => { if (left > 0) { const q = Math.min(left, b.qty); take.push([b, q]); left -= q; } });
        if (left > 0) fail(d.name + ": only " + opd.stock(it.drugId) + " in stock");
        plan.push({ it, d, qty: l.qty, take });
      });
      if (!plan.length) fail("Enter a quantity to dispense");
      let total = 0;
      plan.forEach((p) => {
        p.take.forEach(([b, q]) => { S.update("batches", b.id, { qty: b.qty - q }); S.insert("stockMoves", { batchId: b.id, drugId: p.d.id, type: "issue", qty: -q, rxItemId: p.it.id, at: HMS.nowISO(), by: u.username }); });
        S.update("rxItems", p.it.id, { qtyDispensed: p.it.qtyDispensed + p.qty, dispensedAt: HMS.nowISO(), dispensedBy: u.username });
        const amt = p.d.rate * p.qty; total += amt;
        opd.postCharge(v, "pharmacy", "RX-" + p.it.id, p.d.name + " × " + p.qty, amt);
      });
      HMS.svc.audit("Medicines dispensed", "visit", v.visitNo, plan.map((p) => p.d.code + "×" + p.qty).join(", ") + " · " + HMS.fmtMoney(total));
      return total;
    },

    receiveStock(x) {
      const d = opd.drug(Number(x.drugId));
      if (!d) fail("Select the medicine");
      const batchNo = HMS.clean(x.batchNo).toUpperCase(), qty = Number(x.qty), cost = Number(x.cost || 0);
      if (!batchNo) fail("Enter the batch number");
      if (!x.expiry || x.expiry <= HMS.todayISO()) fail("Expiry date must be in the future");
      if (!Number.isInteger(qty) || qty <= 0) fail("Quantity must be a whole number above zero");
      let b = S.find("batches", (y) => y.drugId === d.id && y.batchNo === batchNo);
      if (b && b.expiry !== x.expiry) fail("Batch " + batchNo + " already exists with a different expiry date");
      if (b) S.update("batches", b.id, { qty: b.qty + qty, received: (b.received || 0) + qty });
      else b = S.insert("batches", { drugId: d.id, batchNo, expiry: x.expiry, qty, received: qty, cost, receivedAt: HMS.todayISO(), supplier: HMS.clean(x.supplier), invoice: HMS.clean(x.invoice) });
      S.insert("stockMoves", { batchId: b.id, drugId: d.id, type: "receipt", qty, at: HMS.nowISO(), by: user().username, ref: HMS.clean(x.invoice) });
      HMS.svc.audit("Stock received", "drug", d.code, batchNo + " · " + qty + " · exp " + HMS.fmtDate(x.expiry));
    },

    // ---------- charges ----------
    /** Charges for a month (YYYY-MM), grouped by employee code. */
    monthSummary(ym) {
      const by = {};
      S.filter("charges", (c) => c.date.slice(0, 7) === ym).forEach((c) => {
        const e = (by[c.empCode] = by[c.empCode] || { empCode: c.empCode, visits: new Set(), consultation: 0, lab: 0, pharmacy: 0, total: 0, held: 0, lines: [] });
        e.lines.push(c);
        if (c.held) { e.held += c.amount; return; }
        e.visits.add(c.visitId); e[c.source] = (e[c.source] || 0) + c.amount; e.total += c.amount;
      });
      return Object.values(by).map((e) => Object.assign(e, { visits: e.visits.size, consultation: +e.consultation.toFixed(2), lab: +e.lab.toFixed(2), pharmacy: +e.pharmacy.toFixed(2), total: +e.total.toFixed(2), held: +e.held.toFixed(2) }))
        .sort((a, b) => b.total - a.total);
    },
  };
  HMS.opd = opd;
})(window.HMS);
