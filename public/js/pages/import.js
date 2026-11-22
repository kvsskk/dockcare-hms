(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("import");
  HMS.layout.render({ page: "import", title: "Employee & Dependent Import", crumb: "Beneficiaries" });
  if (!HMS.auth.can("import")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, st = S.settings();
  let parsed = null, tab = "issues", fileName = "";

  // ---------- column detection ----------
  const COLS = [ // order matters: first match wins
    ["sr", (t) => /^s\.?\s*r?\.?\s*no|^sl\.?\s*no|^sr$/.test(t)],
    ["empCode", (t) => t.includes("code") && !t.includes("pin")],
    ["empName", (t) => (t.includes("employee") || t.includes("emp ")) && t.includes("name")],
    ["name", (t) => /dependent|patient|beneficiar|member|^name$|^full name$/.test(t)],
    ["relation", (t) => t.includes("relation")],
    ["dob", (t) => t.includes("birth") || t === "dob" || t === "d.o.b"],
    ["age", (t) => /^age\b/.test(t)],
    ["gender", (t) => t.includes("gender") || t === "sex"],
    ["grade", (t) => t.includes("grade")],
    ["designation", (t) => t.includes("desig")],
    ["department", (t) => t.includes("dept") || t.includes("department")],
    ["bloodGroup", (t) => t.includes("blood")],
    ["aadhaar", (t) => t.includes("aadhaar") || t.includes("aadhar")],
    ["regnNo", (t) => t.includes("regn") || t.includes("registration")],
    ["oldBookNo", (t) => t.includes("book")],
    ["idMarks", (t) => t.includes("identification") || t.includes("mark")],
    ["mobile", (t) => t.includes("mobile") || t.includes("phone")],
    ["address", (t) => t.includes("address")],
    ["income", (t) => t.includes("income")],
  ];
  const OPTIONAL = { bloodGroup: "Blood group", aadhaar: "Aadhaar", regnNo: "Regn. No.", oldBookNo: "Old book no.", idMarks: "Identification marks", address: "Address", mobile: "Mobile" };

  function mapHeader(row) {
    const map = {};
    row.forEach((cell, i) => {
      const t = String(cell == null ? "" : cell).toLowerCase().replace(/[_\n]/g, " ").replace(/\s+/g, " ").trim();
      if (!t) return;
      const hit = COLS.find(([k, fn]) => map[k] === undefined && fn(t));
      if (hit) map[hit[0]] = i;
    });
    return map;
  }

  // ---------- value normalisers ----------
  function parseDate(v) {
    if (v == null || v === "") return { iso: null, raw: "" };
    if (typeof v === "number") {
      const d = XLSX.SSF.parse_date_code(v);
      if (!d || d.y < 1900) return { iso: null, raw: String(v) };
      return { iso: d.y + "-" + String(d.m).padStart(2, "0") + "-" + String(d.d).padStart(2, "0"), raw: String(v) };
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    let iso = m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null;
    if (!iso) { m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) iso = m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0"); }
    return { iso: iso && HMS.toDate(iso) ? iso : null, raw: s };
  }
  const REL_MAP = { self: "Self", employee: "Self", emp: "Self", spouse: "Spouse", wife: "Spouse", husband: "Spouse", son: "Son", daughter: "Daughter", father: "Father", mother: "Mother" };
  function normRel(v) { const t = HMS.clean(v).toLowerCase(); return REL_MAP[t] || (t ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : ""); }
  function normGender(v) { const t = HMS.clean(v).toLowerCase(); return t === "m" || t === "male" ? "Male" : t === "f" || t === "female" ? "Female" : t ? HMS.clean(v) : ""; }
  const letters = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  const cellText = (v) => (v == null ? "" : typeof v === "string" && v.startsWith("#") ? "" : HMS.clean(v)); // ignore Excel errors like #N/A

  // ---------- parse + validate ----------
  function analyse(aoa) {
    let hIdx = -1, map = null;
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const m = mapHeader(aoa[i] || []);
      if (m.name !== undefined && m.relation !== undefined && (m.empCode !== undefined)) { hIdx = i; map = m; break; }
    }
    if (hIdx < 0) throw new Error("Could not find the heading row. The file needs at least: Employee Code, Name, Relationship, Date of Birth.");

    const fileNotes = [];
    const missing = Object.keys(OPTIONAL).filter((k) => map[k] === undefined).map((k) => OPTIONAL[k]);
    if (missing.length) fileNotes.push(["info", "Columns not in this file: " + missing.join(", ") + ". They can be filled in later at reception."]);
    if (map.dob === undefined) throw new Error("Date of birth column not found.");

    const get = (r, k) => (map[k] === undefined ? null : r[map[k]]);
    // designation column that actually holds names (seen in the hospital register)
    let desigIsName = false;
    if (map.designation !== undefined) {
      const vals = aoa.slice(hIdx + 1).map((r) => cellText(get(r, "designation"))).filter(Boolean);
      desigIsName = vals.length > 0 && vals.filter((v) => /^(sri|smt|kum|kumari|dr|mr|mrs|ms)\b\.?/i.test(v)).length / vals.length > 0.5;
      if (desigIsName) fileNotes.push(["warn", "The Designation column contains names (e.g. “" + vals[0] + "”), not designations. Designation was not imported – update it from the HR master."]);
    }

    const rows = [], seenAad = {}, selfSeen = {};
    let carry = { code: "", empName: "", grade: "", designation: "", department: "" };
    aoa.slice(hIdx + 1).forEach((r, k) => {
      const excelRow = hIdx + 2 + k;
      if (!r || r.every((c) => c == null || String(c).trim() === "")) return;
      const issues = [];
      const add = (level, field, msg, action) => issues.push({ level, field, msg, action });

      let code = cellText(get(r, "empCode")).toUpperCase();
      if (!code && carry.code) { code = carry.code; add("fix", "Employee code", "Blank on dependent row", "Filled from row above (" + code + ")"); }
      else if (code && code !== carry.code) carry = { code, empName: cellText(get(r, "empName")), grade: cellText(get(r, "grade")), designation: desigIsName ? "" : cellText(get(r, "designation")), department: cellText(get(r, "department")) };

      const relRaw = get(r, "relation"), relation = normRel(relRaw);
      if (relRaw != null && String(relRaw) !== relation && relation) add("fix", "Relationship", "Written as “" + String(relRaw) + "”", "Corrected to " + relation);
      const name = HMS.clean(get(r, "name"));
      const dob = parseDate(get(r, "dob"));
      const genderRaw = get(r, "gender"), gender = normGender(genderRaw);
      const aad = String(get(r, "aadhaar") || "").replace(/\D/g, "");
      const row = {
        excelRow, empCode: code, empName: carry.empName, grade: carry.grade, designation: carry.designation, department: carry.department,
        name, relation, dob: dob.iso, dobApprox: false, gender, bloodGroup: cellText(get(r, "bloodGroup")).toUpperCase().replace(/\s|VE$/g, "").replace("POSITIVE", "+").replace("NEGATIVE", "-") || "",
        aadhaar: aad, regnNo: cellText(get(r, "regnNo")).toUpperCase(), oldBookNo: cellText(get(r, "oldBookNo")), idMarks: cellText(get(r, "idMarks")),
        mobile: String(get(r, "mobile") || "").replace(/\D/g, ""), address: cellText(get(r, "address")), income: get(r, "income") === null || get(r, "income") === "" ? null : Number(get(r, "income")),
        issues,
      };

      if (!code) add("err", "Employee code", "Missing", "Enter the employee code");
      if (!name) add("err", "Name", "Missing", "Enter the beneficiary's name");
      if (!relation) add("err", "Relationship", "Missing", "Enter Self, Spouse, Son, Daughter, Father or Mother");
      else if (relation !== "Self" && !st.allowedRelations.includes(relation)) add("err", "Relationship", "“" + relation + "” is not an eligible relation", "Remove the row or change the rule in Settings");
      if (!dob.iso) add("err", "Date of birth", dob.raw ? "“" + dob.raw + "” is not a valid date" : "Missing", "Enter as DD-MM-YYYY");
      if (genderRaw != null && String(genderRaw) !== gender && gender) add("fix", "Gender", "Written as “" + genderRaw + "”", "Corrected to " + gender);
      if (!gender) add("warn", "Gender", "Missing", "Fill in at reception");

      if (dob.iso) {
        const age = HMS.age(dob.iso);
        if (dob.iso.slice(5) === "01-01") { row.dobApprox = true; add("warn", "Date of birth", HMS.fmtDate(dob.iso) + " looks approximate (1st January)", "Marked as approximate"); }
        if (age < 0 || age > 110) add("err", "Date of birth", "Age works out to " + age, "Check the year");
        const ageCell = get(r, "age");
        if (typeof ageCell === "number" && Math.abs(ageCell - age) > 1) add("warn", "Age", "Age column says " + ageCell + ", date of birth gives " + age, "Age is always calculated from date of birth");
        if ((relation === "Son" || relation === "Daughter") && age >= st.childAgeLimit) add("warn", "Age", relation + " is " + age + " – at or above the limit of " + st.childAgeLimit, "Approver to decide");
      }
      if (relation === "Son" && gender === "Female" || relation === "Daughter" && gender === "Male" || relation === "Father" && gender === "Female" || relation === "Mother" && gender === "Male")
        add("warn", "Gender", relation + " recorded as " + gender, "Check the record");

      if (relation === "Self" && code) {
        if (selfSeen[code]) add("err", "Relationship", "Second ‘Self’ row for " + code + " (first on row " + selfSeen[code] + ")", "Keep one Self row per employee");
        else selfSeen[code] = excelRow;
        if (carry.empName && name && letters(carry.empName) !== letters(name)) add("warn", "Name", "Spelling differs: “" + carry.empName + "” / “" + name + "”", "HR to confirm the correct spelling");
        // when the Designation column holds the HR name, compare it too (initials may be in a different position)
        const hrName = desigIsName ? cellText(get(r, "designation")).replace(/^(sri|smt|kum|kumari|dr|mr|mrs|ms)\b\.?\s*/i, "") : "";
        const sorted = (s) => letters(s).split("").sort().join("");
        if (hrName && name && sorted(hrName) !== sorted(name)) add("warn", "Name", "HR name “" + hrName + "” differs from “" + name + "”", "HR to confirm the correct spelling");
      }
      if (aad) {
        if (aad.length !== 12) add("err", "Aadhaar", "Must have 12 digits", "Correct the number");
        else if (seenAad[aad]) add("err", "Aadhaar", "Same Aadhaar as row " + seenAad[aad], "Check for a duplicate person");
        else { seenAad[aad] = excelRow; const dup = S.find("beneficiaries", (b) => b.aadhaar === aad); if (dup) add("err", "Aadhaar", "Already registered as " + dup.name + " (" + dup.empCode + ")", "Check for a duplicate person"); }
      }
      if (row.regnNo && S.find("beneficiaries", (b) => b.regnNo === row.regnNo)) add("err", "Regn. No.", row.regnNo + " already exists in the system", "Check the number");

      // already in system → skip
      if (code && name && dob.iso && S.find("beneficiaries", (b) => b.empCode === code && letters(b.name) === letters(name) && b.dob === dob.iso)) {
        row.skip = true; add("info", "Record", "Already in the system", "Skipped");
      }
      rows.push(row);
    });

    // employee master checks (per family)
    const createEmp = $("#createEmp").checked;
    const codes = Array.from(new Set(rows.map((r) => r.empCode).filter(Boolean)));
    codes.forEach((code) => {
      if (HMS.svc.employee(code)) return;
      const fam = rows.filter((r) => r.empCode === code);
      const self = fam.find((r) => r.relation === "Self");
      if (!createEmp) fam.forEach((r) => r.issues.push({ level: "err", field: "Employee code", msg: code + " not found in the HR employee master", action: "Check the code with HR" }));
      else if (!self) fam.forEach((r) => r.issues.push({ level: "err", field: "Employee code", msg: code + " is not in the master and the file has no ‘Self’ row for it", action: "Add the employee's own row" }));
      else self.issues.push({ level: "fix", field: "Employee", msg: code + " not in the employee master", action: "Will be created from this row" });
    });

    rows.forEach((r) => {
      r.state = r.skip ? "skip" : r.issues.some((i) => i.level === "err") ? "err" : r.issues.some((i) => i.level === "warn") ? "warn" : "ok";
    });
    return { rows, map, fileNotes, codes };
  }

  // ---------- rendering ----------
  function stepper(n) {
    const steps = ["Upload file", "Review issues", "Import"];
    $("#stepper").innerHTML = steps.map((s, i) => (i ? '<div class="bar' + (i < n ? " done" : "") + '"></div>' : "") +
      '<div class="s ' + (i < n ? "done" : i === n ? "cur" : "todo") + '"><span class="n">' + (i < n ? '<i class="bi bi-check"></i>' : i + 1) + "</span>" + s + "</div>").join("");
  }
  function show(step) {
    $("#stepUpload").hidden = step !== 0; $("#stepReview").hidden = step !== 1; $("#stepDone").hidden = step !== 2;
    $("#restartBtn").hidden = step === 0; stepper(step);
  }

  function renderHistory() {
    const list = S.all("imports").slice().reverse();
    $("#history").innerHTML = list.length ? list.map((i) => "<tr><td>" + h(HMS.fmtDateTime(i.at)) + '</td><td class="mono">' + h(i.file) + "</td><td>" + h(i.by) + "</td><td>" + i.rows + "</td><td>" + i.imported + "</td><td>" + i.review + "</td><td>" + i.errors + "</td></tr>").join("")
      : '<tr><td colspan="7" class="text-muted text-center py-3">No imports yet</td></tr>';
  }

  function renderReview() {
    const R = parsed.rows;
    const c = (s) => R.filter((r) => r.state === s).length;
    const fixes = R.filter((r) => r.issues.some((i) => i.level === "fix")).length;
    const kpi = (icon, l, v, d, color) => '<div class="col-sm-6 col-xl"><div class="card kpi p-3 h-100"><div class="l"><i class="bi bi-' + icon + '"></i>' + l + '</div><div class="v"' + (color ? ' style="color:' + color + '"' : "") + ">" + v + '</div><div class="d">' + d + "</div></div></div>";
    $("#kpis").innerHTML = kpi("file-earmark-text", "Rows read", R.length, parsed.codes.length + " employees · " + h(fileName)) +
      kpi("check-circle", "Ready to import", c("ok"), "Includes " + fixes + " auto-fixed rows", "var(--green)") +
      kpi("exclamation-triangle", "Warnings", c("warn"), "Imported as “Needs review”", "var(--amber)") +
      kpi("x-circle", "Errors", c("err"), "Not imported until corrected", "var(--red)") +
      kpi("skip-forward", "Already in system", c("skip"), "Skipped");
    $("#fileNotes").innerHTML = parsed.fileNotes.map((n) => '<div class="note ' + (n[0] === "warn" ? "note-warn" : "note-info") + ' mb-3"><i class="bi bi-' + (n[0] === "warn" ? "exclamation-triangle" : "info-circle") + '"></i><div>' + h(n[1]) + "</div></div>").join("");

    const all = []; R.forEach((r) => r.issues.forEach((i) => all.push(Object.assign({ row: r }, i))));
    const T = [["issues", "All issues", all.filter((i) => i.level !== "info").length], ["err", "Errors", all.filter((i) => i.level === "err").length], ["warn", "Warnings", all.filter((i) => i.level === "warn").length],
      ["fix", "Auto-fixed", all.filter((i) => i.level === "fix").length], ["preview", "Preview data", R.length]];
    $("#tabs").innerHTML = T.map((t) => '<li class="nav-item"><a class="nav-link' + (t[0] === tab ? " active" : "") + '" href="#" data-tab="' + t[0] + '">' + t[1] + ' <span class="badge text-bg-light">' + t[2] + "</span></a></li>").join("");
    const chip = { err: '<span class="chip chip-red">Error</span>', warn: '<span class="chip chip-amber">Warning</span>', fix: '<span class="chip chip-green">Auto-fixed</span>', info: '<span class="chip chip-grey">Info</span>' };
    if (tab === "preview") {
      const st2 = { ok: '<span class="chip chip-green">Ready</span>', warn: '<span class="chip chip-amber">Review</span>', err: '<span class="chip chip-red">Error</span>', skip: '<span class="chip chip-grey">Skip</span>' };
      $("#grid").innerHTML = "<thead><tr><th>Row</th><th>Emp code</th><th>Name</th><th>Relation</th><th>Date of birth</th><th>Age</th><th>Gender</th><th>Status</th></tr></thead><tbody>" +
        R.slice(0, 500).map((r) => '<tr><td class="mono">' + r.excelRow + '</td><td class="mono">' + h(r.empCode) + "</td><td>" + h(r.name) + "</td><td>" + h(r.relation) + "</td><td>" + h(HMS.fmtDate(r.dob)) + "</td><td>" + (r.dob ? HMS.age(r.dob) : "") + "</td><td>" + h(r.gender) + "</td><td>" + st2[r.state] + "</td></tr>").join("") + "</tbody>";
    } else {
      const list = all.filter((i) => tab === "issues" ? i.level !== "info" : i.level === tab).sort((a, b) => ({ err: 0, warn: 1, fix: 2 }[a.level] - { err: 0, warn: 1, fix: 2 }[b.level]) || a.row.excelRow - b.row.excelRow);
      $("#grid").innerHTML = "<thead><tr><th>Row</th><th>Emp code</th><th>Name</th><th>Field</th><th>Issue found</th><th>Action</th><th>Status</th></tr></thead><tbody>" +
        (list.length ? list.slice(0, 1000).map((i) => '<tr><td class="mono">' + i.row.excelRow + '</td><td class="mono">' + h(i.row.empCode) + "</td><td>" + h(i.row.name) + "</td><td>" + h(i.field) + "</td><td>" + h(i.msg) + '</td><td class="text-muted">' + h(i.action) + "</td><td>" + chip[i.level] + "</td></tr>").join("")
          : '<tr><td colspan="7" class="empty"><i class="bi bi-check2-circle"></i>No issues</td></tr>') + "</tbody>";
    }
    const n = c("ok") + c("warn");
    $("#importBtn").disabled = !n;
    $("#importBtn").innerHTML = '<i class="bi bi-upload me-1"></i>Import ' + n + " row" + (n === 1 ? "" : "s");
  }

  // ---------- import ----------
  function doImport() {
    const u = HMS.auth.current();
    const R = parsed.rows.filter((r) => r.state === "ok" || r.state === "warn");
    let newEmp = 0;
    // create missing employees from their Self row
    parsed.codes.forEach((code) => {
      if (HMS.svc.employee(code)) return;
      const self = R.find((r) => r.empCode === code && r.relation === "Self");
      if (!self) return;
      S.insert("employees", { code, name: self.empName || self.name, gender: self.gender, dob: self.dob, grade: self.grade, designation: self.designation || "", department: self.department || "",
        basicPay: null, mobile: self.mobile, address: self.address, status: "active", source: "import" });
      newEmp++;
    });
    const now = HMS.nowISO();
    const valid = HMS.svc.defaultValidUpto();
    const toInsert = R.filter((r) => HMS.svc.employee(r.empCode)).map((r) => {
      const review = r.state === "warn";
      return {
        empCode: r.empCode, name: r.name, relation: r.relation, gender: r.gender, dob: r.dob, dobApprox: r.dobApprox, bloodGroup: r.bloodGroup, aadhaar: r.aadhaar,
        idMarks: r.idMarks, address: r.address, mobile: r.mobile, income: r.income, photo: null, signature: null, documents: [], source: "import",
        status: review ? "review" : "active", regnNo: review ? r.regnNo || null : r.regnNo || null, oldBookNo: r.oldBookNo || null,
        validUpto: review ? null : valid, createdAt: now, createdBy: u.username, approvedBy: review ? null : u.username, approvedAt: review ? null : now,
        remarks: review ? r.issues.filter((i) => i.level === "warn").map((i) => i.field + ": " + i.msg).join("; ") : "",
        history: [{ at: now, by: u.name, action: "Imported from " + fileName, remarks: review ? "Needs review" : "" }], cardPrints: 0, cardPrintedAt: null,
      };
    });
    const inserted = S.insertMany("beneficiaries", toInsert);
    inserted.filter((b) => b.status === "active" && !b.regnNo).forEach((b) => S.update("beneficiaries", b.id, { regnNo: HMS.svc.nextRegnNo() }));
    const review = inserted.filter((b) => b.status === "review").length;
    const errors = parsed.rows.filter((r) => r.state === "err").length;
    S.insert("imports", { at: now, file: fileName, by: u.name, rows: parsed.rows.length, imported: inserted.length - review, review, errors, newEmployees: newEmp });
    HMS.svc.audit("Data imported", "import", fileName, inserted.length + " beneficiaries (" + review + " need review), " + newEmp + " new employees, " + errors + " errors not imported");
    $("#stepDone").innerHTML = '<div class="card"><div class="card-body text-center py-5"><i class="bi bi-check-circle-fill text-success" style="font-size:48px"></i><h2 class="h4 mt-3">Import complete</h2>' +
      '<p class="text-muted mb-4">' + (inserted.length - review) + " beneficiaries active · " + review + " need review · " + newEmp + " employees created · " + errors + " rows with errors not imported</p>" +
      '<div class="d-flex gap-2 justify-content-center">' + (review ? '<a class="btn btn-primary" href="approvals.html">Review ' + review + " records</a>" : "") +
      '<a class="btn btn-light border" href="employees.html">Open employee master</a>' + (errors ? '<button class="btn btn-light border" id="errAgain">Download error report</button>' : "") + "</div></div></div>";
    if (errors) $("#errAgain").onclick = errorReport;
    show(2);
  }

  function errorReport() {
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const lines = ["Excel row,Employee code,Name,Relation,Field,Issue,Action,Status"];
    parsed.rows.forEach((r) => r.issues.filter((i) => i.level === "err" || i.level === "warn").forEach((i) => lines.push([r.excelRow, r.empCode, r.name, r.relation, i.field, i.msg, i.action, i.level === "err" ? "Error" : "Warning"].map(esc).join(","))));
    HMS.downloadText("import_issues_" + fileName.replace(/\.[^.]+$/, "") + ".csv", "﻿" + lines.join("\r\n"), "text/csv");
  }

  function template() {
    const head = ["Employee Code", "Employee Name", "Grade", "Designation", "Department", "Beneficiary Name", "Relationship", "Date of Birth (DD-MM-YYYY)", "Gender",
      "Blood Group", "Aadhaar No", "Regn No", "Old Book No", "Identification Marks", "Mobile", "Address", "Monthly Income (parents only)"];
    const ex = [["F999", "Sample Employee", "E3", "Electrician", "Electrical Maintenance", "Sample Employee", "Self", "15-08-1980", "Male", "B+", "", "", "01234", "Mole on left cheek", "9800000000", "D.No 1-2-3, Gajuwaka, Visakhapatnam", ""],
      ["F999", "Sample Employee", "E3", "Electrician", "Electrical Maintenance", "Sample Spouse", "Spouse", "02-09-1984", "Female", "O+", "", "", "01235", "", "", "", ""],
      ["F999", "Sample Employee", "E3", "Electrician", "Electrical Maintenance", "Sample Mother", "Mother", "14-06-1955", "Female", "A+", "", "", "", "", "", "", "6500"]];
    const help = [["How to fill this template"], ["One row per person. The employee's own row has Relationship = Self."], ["Repeat the Employee Code on every row of the family."],
      ["Relationship: Self, Spouse, Son, Daughter, Father, Mother."], ["Date of Birth as DD-MM-YYYY. Do not type the age – it is calculated."], ["Gender: Male or Female."],
      ["Aadhaar: 12 digits, no spaces. Leave blank if not available."], ["Regn No and Old Book No: copy from the existing medical book if the person has one."], ["Delete the three sample rows before sending."]];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([head].concat(ex));
    ws["!cols"] = head.map((x) => ({ wch: Math.max(12, x.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Beneficiaries");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), "Instructions");
    XLSX.writeFile(wb, "DockCare_import_template.xlsx");
  }

  // ---------- events ----------
  async function readFile(f) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return HMS.toast("File is larger than 10 MB", "danger");
    fileName = f.name;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      parsed = analyse(aoa);
      tab = parsed.rows.some((r) => r.state === "err" || r.state === "warn") ? "issues" : "preview";
      renderReview(); show(1);
    } catch (err) { HMS.toast(err.message || "Could not read this file", "danger"); }
  }
  $("#file").onchange = (e) => { readFile(e.target.files[0]); e.target.value = ""; };
  const dz = $("#drop");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("drag"); readFile(e.dataTransfer.files[0]); });
  $("#tabs").onclick = (e) => { const a = e.target.closest("[data-tab]"); if (a) { e.preventDefault(); tab = a.dataset.tab; renderReview(); } };
  $("#importBtn").onclick = async () => {
    const n = parsed.rows.filter((r) => r.state === "ok" || r.state === "warn").length;
    if (await HMS.confirm("Import " + n + " rows?", "<p>Rows with errors are left out. Rows with warnings go to Dependent Approvals as “Needs review”.</p>", "Import")) doImport();
  };
  $("#errReportBtn").onclick = errorReport;
  $("#templateBtn").onclick = template;
  $("#restartBtn").onclick = () => { parsed = null; renderHistory(); show(0); };
  renderHistory(); show(0);
})();
