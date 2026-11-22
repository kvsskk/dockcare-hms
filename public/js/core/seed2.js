/*
 * Build 2 sample data: doctors, medicines and stock, lab tests, past visits with charges,
 * and a few patients waiting today. Also upgrades an existing Release 0.1 demo database
 * without removing anything already entered.
 */
(function (HMS) {
  "use strict";

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  HMS.LAB_TESTS = [
    ["CBC", "CBC with platelets", 180, "Blood (EDTA)", [["Haemoglobin", "g/dL", 12, 16.5], ["Total WBC count", "/µL", 4000, 11000], ["Platelet count", "/µL", 150000, 450000],
      ["Neutrophils", "%", 40, 75], ["Lymphocytes", "%", 20, 45], ["Haematocrit (PCV)", "%", 36, 50]]],
    ["FBS", "Blood sugar – fasting", 60, "Blood (fluoride)", [["Fasting blood sugar", "mg/dL", 70, 100]]],
    ["PPBS", "Blood sugar – post meal", 60, "Blood (fluoride)", [["Post-prandial blood sugar", "mg/dL", 70, 140]]],
    ["RBS", "Blood sugar – random", 60, "Blood (fluoride)", [["Random blood sugar", "mg/dL", 70, 140]]],
    ["HBA1C", "HbA1c", 350, "Blood (EDTA)", [["HbA1c", "%", 4, 5.6]]],
    ["LIPID", "Lipid profile", 320, "Serum", [["Total cholesterol", "mg/dL", 0, 200], ["Triglycerides", "mg/dL", 0, 150], ["HDL cholesterol", "mg/dL", 40, 80], ["LDL cholesterol", "mg/dL", 0, 100]]],
    ["LFT", "Liver function test", 350, "Serum", [["Bilirubin (total)", "mg/dL", 0.2, 1.2], ["SGOT (AST)", "U/L", 0, 40], ["SGPT (ALT)", "U/L", 0, 41], ["Alkaline phosphatase", "U/L", 44, 147]]],
    ["RFT", "Renal function test", 300, "Serum", [["Blood urea", "mg/dL", 15, 40], ["Serum creatinine", "mg/dL", 0.6, 1.2], ["Uric acid", "mg/dL", 3.5, 7.2]]],
    ["TFT", "Thyroid profile", 400, "Serum", [["T3", "ng/mL", 0.8, 2.0], ["T4", "µg/dL", 5.1, 14.1], ["TSH", "µIU/mL", 0.27, 4.2]]],
    ["URINE", "Urine routine", 80, "Urine", [["Albumin", "", null, null, "Nil"], ["Sugar", "", null, null, "Nil"], ["Pus cells", "/hpf", 0, 5]]],
    ["NS1", "Dengue NS1 antigen", 450, "Serum", [["Dengue NS1 antigen", "", null, null, "Negative"]]],
    ["MP", "Malaria antigen", 150, "Blood", [["Malaria antigen (Pv/Pf)", "", null, null, "Negative"]]],
  ];

  const DRUGS = [
    ["PCM500", "Paracetamol 500 mg tab", 0.8, 500], ["PCM650", "Paracetamol 650 mg tab", 1.2, 500], ["CTZ10", "Cetirizine 10 mg tab", 0.9, 300],
    ["AMX500", "Amoxicillin 500 mg cap", 3.5, 300], ["AZI500", "Azithromycin 500 mg tab", 9.5, 100], ["PAN40", "Pantoprazole 40 mg tab", 2.1, 300],
    ["MET500", "Metformin 500 mg tab", 1.1, 1000], ["AML5", "Amlodipine 5 mg tab", 1.4, 500], ["TEL40", "Telmisartan 40 mg tab", 2.6, 400],
    ["ATV10", "Atorvastatin 10 mg tab", 2.9, 300], ["IBU400", "Ibuprofen 400 mg tab", 1.0, 300], ["DCL50", "Diclofenac 50 mg tab", 0.9, 300],
    ["ORS", "ORS sachet (WHO)", 6.0, 200], ["CSYP", "Cough syrup 100 ml", 38.0, 50], ["BCX", "Vitamin B-complex tab", 1.5, 300],
    ["CALD3", "Calcium + Vitamin D3 tab", 2.4, 300], ["OND4", "Ondansetron 4 mg tab", 2.2, 100], ["DOM10", "Domperidone 10 mg tab", 1.3, 200],
    ["MTZ400", "Metronidazole 400 mg tab", 1.1, 200], ["INSG", "Insulin glargine pen 3 ml", 720.0, 10], ["SALB", "Salbutamol inhaler", 145.0, 20],
  ];

  const DIAG = [["Viral fever", ["PCM650", "CTZ10"]], ["Acute febrile illness", ["PCM650", "ORS"]], ["Hypertension – follow-up", ["AML5", "TEL40"]],
    ["Type 2 diabetes – follow-up", ["MET500"]], ["Gastritis", ["PAN40", "DOM10"]], ["Upper respiratory infection", ["AMX500", "CSYP", "CTZ10"]],
    ["Low back pain", ["DCL50", "BCX"]], ["Acute gastroenteritis", ["ORS", "OND4", "MTZ400"]], ["Allergic rhinitis", ["CTZ10"]], ["Knee pain", ["IBU400", "CALD3"]],
    ["Dyslipidaemia", ["ATV10"]], ["Routine check-up", []]];

  HMS.seedBuild2 = function (db) {
    const r = rng(2611170);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const today = HMS.todayISO();
    db.seq = db.seq || {}; db.counters = db.counters || {};
    ["visits", "rxItems", "labOrders", "drugs", "batches", "stockMoves", "labTests", "charges"].forEach((t) => { db[t] = db[t] || []; db.seq[t] = db.seq[t] || 0; });
    const ins = (t, row) => { const x = Object.assign({ id: ++db.seq[t] }, row); db[t].push(x); return x; };

    // settings
    Object.assign(db.settings, Object.assign({
      departments: [{ name: "General Medicine", fee: 50 }, { name: "Orthopaedics", fee: 100 }, { name: "Gynaecology", fee: 100 }, { name: "Paediatrics", fee: 100 }, { name: "Dental", fee: 100 }],
      expiryAlertDays: 90,
    }, db.settings));

    // doctors
    const docs = [["anitha", "Dr. Anitha Rao", "General Medicine", "4"], ["mohan", "Dr. K. Mohan", "General Medicine", "2"], ["sharma", "Dr. P. Sharma", "General Medicine", "3"],
      ["slakshmi", "Dr. S. Lakshmi", "Gynaecology", "6"], ["kavitha", "Dr. N. Kavitha", "Paediatrics", "7"], ["rvarma", "Dr. R. Varma", "Orthopaedics", "8"], ["dentist", "Dr. A. Rahim", "Dental", "9"]];
    docs.forEach((d) => {
      let u = db.users.find((x) => x.username === d[0]);
      if (!u) u = ins("users", { username: d[0], name: d[1], role: "doctor", password: "Demo@123", active: true });
      u.department = u.department || d[2]; u.room = u.room || d[3];
    });
    db.seq.users = Math.max(db.seq.users || 0, ...db.users.map((u) => u.id));

    // lab tests
    if (!db.labTests.length) HMS.LAB_TESTS.forEach((t) => ins("labTests", { code: t[0], name: t[1], rate: t[2], sample: t[3],
      params: t[4].map((p) => ({ n: p[0], u: p[1], lo: p[2], hi: p[3], normal: p[4] || null })), active: true }));

    // medicines and stock (one batch near expiry, one expired, two below reorder level)
    if (!db.drugs.length) {
      DRUGS.forEach((d, i) => {
        const drug = ins("drugs", { code: d[0], name: d[1], rate: d[2], reorder: d[3], active: true });
        let qty = Math.round(d[3] * (1.5 + r() * 3));
        if (d[0] === "AMX500") qty = 120;
        if (d[0] === "ORS") qty = 85;
        ins("batches", { drugId: drug.id, batchNo: d[0].slice(0, 3) + "25" + (10 + i), expiry: HMS.addDays(today, 260 + Math.floor(r() * 400)), qty, received: qty, cost: +(d[2] * 0.8).toFixed(2), receivedAt: HMS.addDays(today, -40) });
        if (d[0] === "INSG") ins("batches", { drugId: drug.id, batchNo: "INS2507", expiry: HMS.addDays(today, 45), qty: 12, received: 20, cost: 600, receivedAt: HMS.addDays(today, -150) });
        if (d[0] === "CTZ10") ins("batches", { drugId: drug.id, batchNo: "CTZ2412", expiry: HMS.addDays(today, -10), qty: 40, received: 300, cost: 0.7, receivedAt: HMS.addDays(today, -400) });
        if (d[0] === "PCM650") ins("batches", { drugId: drug.id, batchNo: "PCM2502", expiry: HMS.addDays(today, 120), qty: 60, received: 1000, cost: 1.0, receivedAt: HMS.addDays(today, -200) });
      });
    }

    const doctorsBy = (dep) => db.users.filter((u) => u.role === "doctor" && u.department === dep);
    const fee = (dep) => (db.settings.departments.find((d) => d.name === dep) || { fee: 50 }).fee;
    const drugByCode = (c) => db.drugs.find((d) => d.code === c);
    const active = db.beneficiaries.filter((b) => b.status === "active");
    const charge = (v, source, ref, description, amount) => ins("charges", { date: v.date, empCode: v.empCode, benId: v.benId, visitId: v.id, source, ref, description, amount: +amount.toFixed(2), held: false, createdAt: v.date + "T06:30:00.000Z", createdBy: v.doctor });

    function pastVisit(b, date, dep, diagIdx, withLab) {
      const doc = pick(doctorsBy(dep));
      const tok = 1 + Math.floor(r() * 120);
      const [dx, meds] = DIAG[diagIdx];
      const v = ins("visits", { visitNo: "OP-" + date.slice(2).replace(/-/g, "") + "-" + String(tok).padStart(4, "0"), benId: b.id, empCode: b.empCode, date, token: tok,
        department: dep, doctor: doc.username, visitType: "fresh", priority: "normal", complaint: dx === "Routine check-up" ? "Routine check-up" : "Not well since 2–3 days",
        status: "completed", createdAt: date + "T04:00:00.000Z", createdBy: "swathi",
        vitals: { bpSys: 110 + Math.floor(r() * 40), bpDia: 70 + Math.floor(r() * 20), pulse: 68 + Math.floor(r() * 30), temp: +(97.6 + r() * 3).toFixed(1), spo2: 96 + Math.floor(r() * 4), weight: 50 + Math.floor(r() * 35), height: 150 + Math.floor(r() * 30), sugar: null, triage: "normal", notes: "", by: "mary", at: date + "T04:20:00.000Z" },
        consult: { diagnosis: [dx], notes: "", followUpDays: dx.includes("follow-up") ? 30 : null, by: doc.username, startedAt: date + "T04:40:00.000Z", completedAt: date + "T04:55:00.000Z" } });
      charge(v, "consultation", v.visitNo, "Consultation – " + dep, fee(dep));
      meds.forEach((code) => {
        const d = drugByCode(code); const days = dx.includes("follow-up") || dx === "Dyslipidaemia" ? 30 : 3 + Math.floor(r() * 3);
        const per = code === "ORS" || code === "CSYP" ? 1 : 2; const qty = code === "CSYP" ? 1 : per * days;
        const it = ins("rxItems", { visitId: v.id, benId: b.id, drugId: d.id, dosage: per === 2 ? "1-0-1" : "1-0-0", instruction: "After food", days, qty, qtyDispensed: qty, dispensedAt: date + "T05:10:00.000Z", dispensedBy: "kiran" });
        charge(v, "pharmacy", "RX-" + it.id, d.name + " × " + qty, d.rate * qty);
      });
      if (withLab) {
        const tests = dx.includes("diabetes") ? ["FBS", "HBA1C"] : dx === "Dyslipidaemia" || dx === "Routine check-up" ? ["FBS", "LIPID"] : ["CBC"];
        const items = tests.map((c) => { const t = db.labTests.find((x) => x.code === c);
          return { testId: t.id, values: t.params.map((p) => p.normal ? p.normal : +(p.lo + (p.hi - p.lo) * (0.15 + r() * 0.95)).toFixed(p.hi > 1000 ? 0 : 1)) }; });
        items.forEach((it) => { const t = db.labTests.find((x) => x.id === it.testId); it.flags = t.params.map((p, k) => HMS.labFlag(p, it.values[k])); });
        db.counters.lab = (db.counters.lab || 600) + 1;
        const lo = ins("labOrders", { orderNo: "LB-" + String(db.counters.lab).padStart(5, "0"), visitId: v.id, benId: b.id, empCode: b.empCode, priority: "normal", status: "released", items,
          orderedBy: doc.username, orderedAt: date + "T04:55:00.000Z", collectedAt: date + "T05:15:00.000Z", releasedAt: date + "T07:30:00.000Z", releasedBy: "ramesh" });
        const amt = items.reduce((s, it) => s + db.labTests.find((x) => x.id === it.testId).rate, 0);
        charge(v, "lab", lo.orderNo, "Lab – " + tests.join(", "), amt);
      }
      return v;
    }

    if (!db.visits.length) {
      // history for the family used in demos (F612 – Lakshmi Naidu)
      const lakshmi = db.beneficiaries.find((b) => b.regnNo === "2411L202");
      if (lakshmi) {
        lakshmi.allergies = lakshmi.allergies || "Sulfa drugs";
        pastVisit(lakshmi, HMS.addDays(today, -97), "General Medicine", 0, true);
        pastVisit(lakshmi, HMS.addDays(today, -41), "General Medicine", 11, true);
        pastVisit(lakshmi, HMS.addDays(today, -16), "General Medicine", 4, false);
      }
      // general history over the last ~75 days
      for (let i = 0; i < 160; i++) {
        const b = pick(active);
        const age = HMS.age(b.dob);
        const dep = age < 14 ? "Paediatrics" : r() < 0.78 ? "General Medicine" : pick(["Orthopaedics", "Gynaecology", "Dental"]);
        const d = dep === "Orthopaedics" ? pick([6, 9]) : dep === "Dental" ? 11 : Math.floor(r() * DIAG.length);
        pastVisit(b, HMS.addDays(today, -1 - Math.floor(r() * 75)), dep, d, r() < 0.4);
      }
      // patients already waiting today
      const tokKey = "tok" + today.replace(/-/g, "");
      const waiting = [["Venkata", "registered"], ["", "vitals_done"], ["", "registered"], ["", "vitals_done"]];
      waiting.forEach((w, i) => {
        const b = active[(i * 17 + 5) % active.length];
        const t = i + 1;
        const at = new Date(); at.setMinutes(at.getMinutes() - (50 - i * 12));
        ins("visits", { visitNo: "OP-" + today.slice(2).replace(/-/g, "") + "-" + String(t).padStart(4, "0"), benId: b.id, empCode: b.empCode, date: today, token: t,
          department: "General Medicine", doctor: i % 2 ? "mohan" : "anitha", visitType: "fresh", priority: "normal",
          complaint: ["Fever and headache", "BP check", "Cough and cold", "Stomach pain"][i], status: w[1], createdAt: at.toISOString(), createdBy: "swathi",
          vitals: w[1] === "vitals_done" ? { bpSys: 132, bpDia: 84, pulse: 82, temp: 98.9, spo2: 98, weight: 66, height: 162, sugar: null, triage: "normal", notes: "", by: "mary", at: at.toISOString() } : null, consult: null });
      });
      db.counters[tokKey] = waiting.length;
    }
    db.counters.lab = db.counters.lab || 600;
    db.version = 2;
    return db;
  };

  /** Flag a lab value: L / H against the numeric range, A (abnormal) if a text result differs from normal, N otherwise. */
  HMS.labFlag = function (p, v) {
    if (v === null || v === undefined || v === "") return "";
    if (p.normal) return String(v).trim().toLowerCase() === p.normal.toLowerCase() ? "N" : "A";
    const n = Number(v);
    if (isNaN(n)) return "";
    if (p.lo !== null && n < p.lo) return "L";
    if (p.hi !== null && n > p.hi) return "H";
    return "N";
  };
})(window.HMS);
