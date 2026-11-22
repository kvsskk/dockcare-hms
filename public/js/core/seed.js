/*
 * Sample data for demo mode. All names, codes and numbers are fictional.
 * Replaced by the real HR/hospital data through Admin › Data Import.
 */
(function (HMS) {
  "use strict";

  function rng(seed) { // small deterministic random generator so every demo starts the same
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  HMS.seed = function () {
    const r = rng(20261117);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const pad = (n, w) => String(n).padStart(w, "0");
    const dob = (yFrom, yTo) => yFrom + Math.floor(r() * (yTo - yFrom + 1)) + "-" + pad(1 + Math.floor(r() * 12), 2) + "-" + pad(1 + Math.floor(r() * 28), 2);

    const maleFirst = ["Venkata Rao", "Srinivasa Rao", "Ravi Kumar", "Suresh Babu", "Nagaraju", "Satyanarayana", "Ramesh", "Prasad", "Krishna Murthy", "Appala Naidu", "Chandra Sekhar", "Anil Kumar", "Kishore", "Sai Kiran", "Mohan Rao", "Durga Prasad", "Vijay Kumar", "Ramana", "Hari Babu", "Siva Kumar"];
    const femaleFirst = ["Lakshmi", "Padmavathi", "Sujatha", "Kalyani", "Sarada", "Annapurna", "Madhavi", "Swarupa", "Vani", "Jyothi", "Bhavani", "Sravani", "Aruna", "Rama Devi", "Sunitha"];
    const sons = ["Sai", "Teja", "Harsha", "Karthik", "Vamsi", "Rohith", "Charan", "Abhiram"];
    const daughters = ["Priya", "Keerthi", "Divya", "Harika", "Sindhu", "Tejaswi", "Pavani", "Mounika"];
    const surnames = ["Naidu", "Patnaik", "Reddy", "Varma", "Rao", "Dora", "Murthy", "Sastry", "Babu", "Raju", "Chowdary", "Prasad"];
    const depts = [["Electrical Maintenance", ["Electrician", "Chargeman (Electrical)", "Asst. Manager (Electrical)"]],
      ["Hull Shop", ["Shipwright", "Welder", "Fitter", "Dy. Manager (Hull)"]], ["Machine Shop", ["Machinist", "Turner", "Fitter"]],
      ["Outfitting", ["Rigger", "Pipe Fitter", "Painter"]], ["Planning", ["Planning Assistant", "Manager (Planning)"]],
      ["Stores", ["Store Keeper", "Asst. Manager (Stores)"]], ["Finance", ["Accounts Assistant", "Manager (Finance)"]],
      ["Human Resources", ["HR Assistant", "Dy. Manager (HR)"]], ["Design", ["Draughtsman", "Engineer (Design)"]]];
    const bloods = ["O+", "O+", "B+", "B+", "A+", "A+", "AB+", "O-", "B-"];
    const areas = ["Gajuwaka", "Malkapuram", "Scindia Colony", "Sriharipuram", "Akkayyapalem", "Madhavadhara", "Seethammadhara", "Kancharapalem"];
    const marks = ["Mole on left cheek", "Mole on right forearm", "Scar on left eyebrow", "Mole on chin", "Scar on right knee", "Mole on neck"];

    const employees = [], bens = [];
    let empId = 0, benId = 0, regnSeq = 100, book = 1500;
    const regn = (yymm) => yymm + "L" + pad(++regnSeq, 3);

    function addBen(e, o) {
      const b = Object.assign({
        id: ++benId, empCode: e.code, bloodGroup: pick(bloods), aadhaar: "", idMarks: pick(marks), address: e.address,
        mobile: "", income: null, photo: null, signature: null, documents: [], status: "active",
        validUpto: "2028-03-31", source: "seed", createdAt: "2024-04-01T10:00:00.000Z", createdBy: "system",
        approvedBy: "system", approvedAt: "2024-04-02T10:00:00.000Z", remarks: "", history: [], cardPrints: 1, cardPrintedAt: "2024-04-05T10:00:00.000Z",
      }, o);
      b.aadhaar = b.aadhaar || String(Math.floor(r() * 9e11) + 1e11);
      if (b.status === "active") { b.regnNo = b.regnNo || regn(pick(["2404", "2405", "2409", "2502", "2507"])); b.oldBookNo = b.oldBookNo || pad(++book, 5); }
      else { b.regnNo = null; b.oldBookNo = null; b.approvedBy = null; b.approvedAt = null; b.cardPrints = 0; b.cardPrintedAt = null; b.validUpto = null; }
      bens.push(b); return b;
    }

    // Family used in the approved screen designs
    const ravi = { id: ++empId, code: "F612", name: "Ravi Kumar Naidu", gender: "Male", dob: "1978-03-11", grade: "E3", designation: "Electrician",
      department: "Electrical Maintenance", basicPay: 48200, mobile: "9848012321", address: "D.No 60-32-52, Prakash Colony, Malkapuram, Visakhapatnam – 530011", status: "active" };
    employees.push(ravi);
    addBen(ravi, { name: "Ravi Kumar Naidu", relation: "Self", gender: "Male", dob: ravi.dob, bloodGroup: "B+", regnNo: "2411L201", oldBookNo: "01767", mobile: ravi.mobile });
    addBen(ravi, { name: "Lakshmi Naidu", relation: "Spouse", gender: "Female", dob: "1982-09-02", bloodGroup: "O+", regnNo: "2411L202", oldBookNo: "01768", idMarks: "Mole on right forearm" });
    addBen(ravi, { name: "Sai Naidu", relation: "Son", gender: "Male", dob: "2007-06-21", bloodGroup: "B+", regnNo: "2411L203", oldBookNo: "01769" });
    addBen(ravi, { name: "Priya Naidu", relation: "Daughter", gender: "Female", dob: "2011-01-15", bloodGroup: "O+", regnNo: "2411L204", oldBookNo: "01770" });
    addBen(ravi, { name: "Satyavathi Naidu", relation: "Mother", gender: "Female", dob: "1954-06-14", bloodGroup: "A+", status: "pending", income: 6500,
      createdAt: "2026-11-16T11:42:00.000Z", createdBy: "swathi", documents: [{ name: "aadhaar_satyavathi.pdf", size: 412000 }, { name: "pension_slip_oct.jpg", size: 280000 }],
      history: [{ at: "2026-11-16T11:42:00.000Z", by: "K. Swathi", action: "Submitted for approval", remarks: "" }] });

    for (let i = 0; i < 59; i++) {
      const [dept, desigs] = pick(depts);
      const male = r() > 0.12;
      const sur = pick(surnames);
      const first = male ? pick(maleFirst) : pick(femaleFirst);
      const grade = r() > 0.55 ? "E" + (1 + Math.floor(r() * 6)) : "W" + (1 + Math.floor(r() * 8));
      let code;
      do { code = (r() > 0.5 ? "F" : "K") + (100 + Math.floor(r() * 899)); } while (employees.some((e) => e.code === code));
      const e = { id: ++empId, code, name: first + " " + sur, gender: male ? "Male" : "Female", dob: dob(1966, 1996), grade,
        designation: pick(desigs), department: dept, basicPay: 28000 + Math.floor(r() * 60) * 1000,
        mobile: "9" + Math.floor(r() * 1e9).toString().padStart(9, "0"), address: "D.No " + (1 + Math.floor(r() * 80)) + "-" + (1 + Math.floor(r() * 40)) + "-" + (1 + Math.floor(r() * 99)) + ", " + pick(areas) + ", Visakhapatnam", status: "active" };
      employees.push(e);
      const empYear = +e.dob.slice(0, 4);
      addBen(e, { name: e.name, relation: "Self", gender: e.gender, dob: e.dob, mobile: e.mobile });
      if (r() > 0.1) addBen(e, { name: (male ? pick(femaleFirst) : pick(maleFirst)) + " " + sur, relation: "Spouse", gender: male ? "Female" : "Male", dob: dob(empYear - 2, empYear + 5) });
      const kids = Math.floor(r() * 3.4);
      for (let k = 0; k < kids; k++) {
        const son = r() > 0.5;
        addBen(e, { name: (son ? pick(sons) : pick(daughters)) + " " + sur, relation: son ? "Son" : "Daughter", gender: son ? "Male" : "Female", dob: dob(Math.min(empYear + 22, 2024), Math.min(empYear + 34, 2025)) });
      }
      if (r() > 0.72) addBen(e, { name: pick(maleFirst) + " " + sur, relation: "Father", gender: "Male", dob: dob(empYear - 32, empYear - 24), income: 4000 + Math.floor(r() * 8) * 1000 });
      if (r() > 0.6) addBen(e, { name: pick(femaleFirst) + " " + sur, relation: "Mother", gender: "Female", dob: dob(empYear - 30, empYear - 20), income: 3000 + Math.floor(r() * 6) * 1000 });
    }

    // A few requests waiting for approval / returned, so the approval queue is not empty
    const queue = [
      ["K-", "Son", "Male", "2019-08-14", "pending", "Arjun"], ["F-", "Spouse", "Female", "1994-02-03", "pending", "Meena Kumari"],
      ["K-", "Daughter", "Female", "2001-05-22", "pending", "Kavya"], ["F-", "Father", "Male", "1955-01-01", "pending", "Ramaiah"],
      ["K-", "Son", "Male", "2000-03-12", "returned", "Harsha"],
    ];
    queue.forEach((q, i) => {
      const e = employees[3 + i * 7];
      const sur = e.name.split(" ").pop();
      addBen(e, { name: q[5].includes(" ") ? q[5] : q[5] + " " + sur, relation: q[1], gender: q[2], dob: q[3], status: q[4],
        income: q[1] === "Father" ? 11500 : null, createdAt: "2026-11-1" + (3 + (i % 4)) + "T" + String(4 + i).padStart(2, "0") + ":15:00.000Z", createdBy: "swathi",
        documents: [{ name: "aadhaar.pdf", size: 380000 }],
        remarks: q[4] === "returned" ? "Birth certificate not legible – please re-upload." : "",
        history: [{ at: "2026-11-13T09:15:00.000Z", by: "K. Swathi", action: "Submitted for approval", remarks: "" }].concat(
          q[4] === "returned" ? [{ at: "2026-11-14T15:05:00.000Z", by: "Dr. M. Srinivas", action: "Returned for correction", remarks: "Birth certificate not legible – please re-upload." }] : []) });
    });

    const users = [
      ["swathi", "K. Swathi", "reception"], ["mary", "Sr. R. Mary", "nurse"], ["anitha", "Dr. Anitha Rao", "doctor"],
      ["ramesh", "T. Ramesh", "lab"], ["kiran", "B. Kiran", "pharmacy"], ["lavanya", "G. Lavanya", "accounts"],
      ["prasad", "Y. Prasad", "hr"], ["admin", "Dr. M. Srinivas", "admin"],
    ].map((u, i) => ({ id: i + 1, username: u[0], name: u[1], role: u[2], password: "Demo@123", active: true }));

    return {
      version: 1,
      createdAt: new Date().toISOString(),
      seq: { employees: empId, beneficiaries: benId, users: users.length, audit: 0, imports: 0 },
      counters: { ["regn" + new Date().toISOString().slice(2, 4) + new Date().toISOString().slice(5, 7)]: 300 },
      settings: {
        hospitalName: "Hospital",
        city: "Visakhapatnam",
        approverRole: "admin",          // "admin" = Hospital Admin, "hr" = HR – open decision, change in Settings
        childAgeLimit: 25,              // children eligible below this age
        parentIncomeLimit: 9000,        // parents eligible if monthly income is at or below this
        allowedRelations: ["Spouse", "Son", "Daughter", "Father", "Mother"],
        cardValidityYears: 3,
        requireAadhaar: true,
        sessionMinutes: 15,
      },
      employees, beneficiaries: bens, users, audit: [], imports: [],
    };
  };
})(window.HMS);
