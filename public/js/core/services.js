/*
 * Business rules for the beneficiary registry. Pages call these functions; they never change data directly.
 * The same rules will run on the Node.js server when the Supabase database is connected.
 */
(function (HMS) {
  "use strict";
  const S = HMS.store;

  const REL_ORDER = ["Self", "Spouse", "Son", "Daughter", "Father", "Mother"];
  const STATUS = {
    active: ["Active", "chip-green"], pending: ["Pending approval", "chip-amber"], returned: ["Returned for correction", "chip-blue"],
    rejected: ["Rejected", "chip-red"], review: ["Needs review", "chip-amber"], inactive: ["Inactive", "chip-grey"], expired: ["Expired", "chip-red"],
  };
  const ROLE_NAMES = { reception: "Receptionist", nurse: "Staff Nurse", doctor: "Medical Officer", lab: "Lab Technician",
    pharmacy: "Pharmacist", accounts: "Accounts Officer", hr: "HR Approver", admin: "Hospital Administrator" };

  function user() { return HMS.auth && HMS.auth.current() ? HMS.auth.current() : { username: "system", name: "System", role: "system" }; }

  const svc = {
    REL_ORDER, STATUS, ROLE_NAMES,

    statusChip(b) {
      const st = svc.effectiveStatus(b);
      const s = STATUS[st] || [st, "chip-grey"];
      return '<span class="chip ' + s[1] + '">' + HMS.h(s[0]) + "</span>";
    },
    /** Active beneficiaries whose validity date has passed are shown as Expired. */
    effectiveStatus(b) {
      if (b.status === "active" && b.validUpto && b.validUpto < HMS.todayISO()) return "expired";
      return b.status;
    },

    audit(action, entity, ref, details) {
      const u = user();
      S.insert("audit", { at: HMS.nowISO(), user: u.username, name: u.name, role: u.role, action, entity, ref: ref == null ? "" : String(ref), details: details || "" });
    },

    employee(code) { return S.find("employees", (e) => e.code.toUpperCase() === String(code || "").trim().toUpperCase()); },
    beneficiary(id) { return S.get("beneficiaries", id); },

    family(code) {
      return S.filter("beneficiaries", (b) => b.empCode === code && b.status !== "rejected")
        .sort((a, b) => REL_ORDER.indexOf(a.relation) - REL_ORDER.indexOf(b.relation) || String(a.dob).localeCompare(String(b.dob)));
    },

    /** Search by employee code, Regn. No., old book no., name or mobile. Returns employees. */
    search(q) {
      q = HMS.clean(q).toLowerCase();
      if (q.includes("|")) q = q.split("|")[0].trim(); // scanned card QR: "RegnNo|EmpCode"
      if (q.length < 2) return [];
      const codes = new Set();
      S.all("employees").forEach((e) => {
        if (e.code.toLowerCase() === q || e.name.toLowerCase().includes(q) || (e.mobile || "").includes(q)) codes.add(e.code);
      });
      S.all("beneficiaries").forEach((b) => {
        if ((b.regnNo || "").toLowerCase() === q || (b.oldBookNo || "") === q || b.name.toLowerCase().includes(q)) codes.add(b.empCode);
      });
      if (!codes.size) S.all("employees").forEach((e) => { if (e.code.toLowerCase().startsWith(q)) codes.add(e.code); });
      return Array.from(codes).map((c) => svc.employee(c)).filter(Boolean).slice(0, 30);
    },

    /**
     * Eligibility checks for a dependent. Returns [{level: ok|warn|err, title, detail}].
     * "err" blocks submission; "warn" can be submitted and is shown to the approver.
     */
    checkEligibility(d, opts) {
      const st = S.settings();
      const out = [];
      const emp = svc.employee(d.empCode);
      const add = (level, title, detail) => out.push({ level, title, detail });
      const ignoreId = opts && opts.ignoreId;

      if (!emp) add("err", "Employee not found", "Employee code is not in the HR employee master");
      else if (emp.status !== "active") add("err", "Employee not active", "HR status is " + emp.status);
      else add("ok", "Employee active in HR master", emp.code + " · " + emp.name);

      if (!d.relation) add("err", "Relation missing", "Select the relation to the employee");
      else if (!st.allowedRelations.includes(d.relation)) add("err", "Relation not eligible", d.relation + " is not an eligible relation");
      else add("ok", "Relation allowed", d.relation + " is an eligible relation");

      const age = HMS.age(d.dob);
      if (age === null) add("err", "Date of birth invalid", "Enter a valid date of birth");
      else if (age < 0 || age > 110) add("err", "Date of birth out of range", "Age works out to " + age + " years");
      else if ((d.relation === "Son" || d.relation === "Daughter") && age >= st.childAgeLimit)
        add("warn", "Age at or above limit", d.relation + " is " + age + " years (limit below " + st.childAgeLimit + ")");
      else add("ok", "Age " + age + " years", "Calculated from date of birth");

      if (d.relation === "Son" && d.gender === "Female" || d.relation === "Daughter" && d.gender === "Male" ||
          d.relation === "Father" && d.gender === "Female" || d.relation === "Mother" && d.gender === "Male")
        add("warn", "Relation and gender do not match", d.relation + " recorded as " + d.gender);

      if (emp && (d.relation === "Son" || d.relation === "Daughter" || d.relation === "Father" || d.relation === "Mother")) {
        const ea = HMS.age(emp.dob), da = HMS.age(d.dob);
        if (ea !== null && da !== null) {
          if ((d.relation === "Son" || d.relation === "Daughter") && ea - da < 15) add("warn", "Check date of birth", "Child is only " + (ea - da) + " years younger than the employee");
          if ((d.relation === "Father" || d.relation === "Mother") && da - ea < 15) add("warn", "Check date of birth", "Parent is only " + (da - ea) + " years older than the employee");
        }
      }

      if (d.relation === "Father" || d.relation === "Mother") {
        if (d.income === null || d.income === undefined || d.income === "") add("warn", "Income not declared", "Parents' monthly income is needed");
        else if (Number(d.income) > st.parentIncomeLimit) add("warn", "Income above limit", HMS.fmtMoney(d.income) + " is above " + HMS.fmtMoney(st.parentIncomeLimit));
        else add("ok", "Income within limit", HMS.fmtMoney(d.income) + " is within the limit");
      }

      if (emp && d.relation && ["Spouse", "Father", "Mother"].includes(d.relation)) {
        const same = svc.family(emp.code).filter((b) => b.relation === d.relation && b.id !== ignoreId && b.status !== "inactive");
        if (same.length && d.relation !== "Spouse") add("err", "Already registered", "A " + d.relation.toLowerCase() + " is already registered: " + same[0].name);
        else if (same.length) add("warn", "Spouse already registered", same.map((b) => b.name).join(", ") + " – confirm before approving");
      }

      const aad = String(d.aadhaar || "").replace(/\D/g, "");
      if (!aad) add(st.requireAadhaar ? "warn" : "ok", st.requireAadhaar ? "Aadhaar missing" : "Aadhaar not given", st.requireAadhaar ? "Collect Aadhaar before approval" : "");
      else if (aad.length !== 12) add("err", "Aadhaar number invalid", "Aadhaar must have 12 digits");
      else {
        const dup = S.find("beneficiaries", (b) => b.id !== ignoreId && String(b.aadhaar || "").replace(/\D/g, "") === aad && b.status !== "rejected");
        if (dup) add("err", "Duplicate Aadhaar", "Already registered as " + dup.name + " under " + dup.empCode);
        else add("ok", "No duplicate found", "Aadhaar not linked to any other beneficiary");
      }
      return out;
    },

    /** Next Regn. No. in the format YYMM + "L" + running number, e.g. 2611L301. */
    nextRegnNo() {
      const now = new Date();
      const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0");
      let n, regn;
      do { n = S.counter("regn" + yymm); regn = yymm + "L" + String(n).padStart(3, "0"); }
      while (S.find("beneficiaries", (b) => b.regnNo === regn));
      return regn;
    },

    /** Save a new or corrected dependent and send it for approval. */
    submitDependent(data, existingId) {
      const u = user();
      const checks = svc.checkEligibility(data, { ignoreId: existingId });
      if (checks.some((c) => c.level === "err")) throw new Error(checks.filter((c) => c.level === "err").map((c) => c.title).join(", "));
      const fields = ["empCode", "name", "relation", "gender", "dob", "bloodGroup", "aadhaar", "idMarks", "address", "mobile", "income", "photo", "signature", "documents", "oldBookNo"];
      const row = {}; fields.forEach((f) => (row[f] = data[f] === undefined ? null : data[f]));
      const hist = { at: HMS.nowISO(), by: u.name, action: existingId ? "Corrected and resubmitted" : "Submitted for approval", remarks: "" };
      let b;
      if (existingId) {
        const old = svc.beneficiary(existingId);
        b = S.update("beneficiaries", existingId, Object.assign(row, { status: "pending", remarks: "", history: (old.history || []).concat(hist) }));
        svc.audit("Dependent resubmitted", "beneficiary", b.id, b.name + " · " + b.empCode);
      } else {
        b = S.insert("beneficiaries", Object.assign(row, { status: "pending", source: "manual", regnNo: null, validUpto: null,
          createdAt: HMS.nowISO(), createdBy: u.username, approvedBy: null, approvedAt: null, remarks: "", history: [hist], cardPrints: 0, cardPrintedAt: null }));
        svc.audit("Dependent added", "beneficiary", b.id, b.name + " (" + b.relation + ") · " + b.empCode);
      }
      return b;
    },

    canApprove() { const u = user(); return u.role === S.settings().approverRole || u.role === "admin"; },

    decide(id, decision, remarks, validUpto) {
      const u = user();
      if (!svc.canApprove()) throw new Error("You are not the approver for dependents");
      const b = svc.beneficiary(id);
      if (!b || !["pending", "review"].includes(b.status)) throw new Error("This request is no longer waiting for approval");
      if ((decision === "returned" || decision === "rejected") && !HMS.clean(remarks)) throw new Error("Remarks are required when returning or rejecting");
      const label = { active: "Approved", returned: "Returned for correction", rejected: "Rejected" }[decision];
      const patch = { status: decision, remarks: HMS.clean(remarks), history: (b.history || []).concat([{ at: HMS.nowISO(), by: u.name, action: label, remarks: HMS.clean(remarks) }]) };
      if (decision === "active") Object.assign(patch, { regnNo: b.regnNo || svc.nextRegnNo(), validUpto, approvedBy: u.username, approvedAt: HMS.nowISO() });
      S.update("beneficiaries", id, patch);
      // emergency charges held while the dependent was pending are released for recovery once approved
      if (decision === "active") S.filter("charges", (c) => c.benId === id && c.held).forEach((c) => S.update("charges", c.id, { held: false }));
      svc.audit("Dependent " + label.toLowerCase(), "beneficiary", id, b.name + " · " + b.empCode + (patch.regnNo ? " · Regn " + patch.regnNo : "") + (remarks ? " · " + remarks : ""));
      return svc.beneficiary(id);
    },

    defaultValidUpto() {
      const y = new Date().getFullYear() + S.settings().cardValidityYears;
      return y + "-03-31";
    },

    recordCardPrint(id) {
      const b = svc.beneficiary(id);
      S.update("beneficiaries", id, { cardPrints: (b.cardPrints || 0) + 1, cardPrintedAt: HMS.nowISO() });
      svc.audit(b.cardPrints ? "Card reprinted" : "Card printed", "beneficiary", id, b.name + " · " + b.regnNo);
    },

    pendingCount() { return S.filter("beneficiaries", (b) => b.status === "pending" || b.status === "review").length; },
  };
  HMS.svc = svc;
})(window.HMS);
