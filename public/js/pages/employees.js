(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("employees");
  HMS.layout.render({ page: "employees", title: "Employee Master", crumb: "Beneficiaries" });
  if (!HMS.auth.can("employees")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, PAGE = 50;
  let page = 0;
  const depts = Array.from(new Set(S.all("employees").map((e) => e.department).filter(Boolean))).sort();
  $("#dept").innerHTML += depts.map((d) => "<option>" + h(d) + "</option>").join("");
  if (HMS.param("q")) $("#q").value = HMS.param("q");

  function filtered() {
    const q = HMS.clean($("#q").value).toLowerCase(), d = $("#dept").value, st = $("#status").value;
    return S.all("employees").filter((e) => (!st || e.status === st) && (!d || e.department === d) && (!q || e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)))
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  function render() {
    const list = filtered(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, pages - 1);
    const fams = {}; S.all("beneficiaries").forEach((b) => { const f = (fams[b.empCode] = fams[b.empCode] || { n: 0, p: 0 }); if (b.status === "active") f.n++; if (b.status === "pending" || b.status === "review") f.p++; });
    const link = HMS.auth.can("patients");
    $("#list").innerHTML = list.slice(page * PAGE, page * PAGE + PAGE).map((e) => { const f = fams[e.code] || { n: 0, p: 0 };
      return '<tr' + (link ? ' class="clickable" data-code="' + h(e.code) + '"' : "") + '><td class="mono"><b>' + h(e.code) + "</b></td><td>" + h(e.name) + "</td><td>" + h(e.designation) + '</td><td class="text-muted">' + h(e.department) + "</td><td>" + h(e.grade) +
        "</td><td>" + f.n + "</td><td>" + (f.p ? '<span class="chip chip-amber">' + f.p + "</span>" : "") + "</td></tr>"; }).join("") || '<tr><td colspan="7" class="empty">No employees match</td></tr>';
    $("#count").textContent = list.length.toLocaleString("en-IN") + " employees · page " + (page + 1) + " of " + pages;
    $("#pager").innerHTML = '<button class="btn btn-sm btn-light border" data-p="-1"' + (page ? "" : " disabled") + '>Previous</button><button class="btn btn-sm btn-light border" data-p="1"' + (page < pages - 1 ? "" : " disabled") + ">Next</button>";
  }
  $("#list").onclick = (e) => { const tr = e.target.closest("tr[data-code]"); if (tr) location.href = "patients.html?emp=" + encodeURIComponent(tr.dataset.code); };
  $("#pager").onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) { page += Number(b.dataset.p); render(); } };
  ["q", "dept", "status"].forEach((id) => $("#" + id).addEventListener("input", HMS.debounce(() => { page = 0; render(); }, 200)));
  $("#exportBtn").onclick = () => {
    const rows = [];
    filtered().forEach((e) => HMS.svc.family(e.code).forEach((b) => rows.push({
      "Employee Code": e.code, "Employee Name": e.name, Grade: e.grade, Designation: e.designation, Department: e.department,
      "Beneficiary Name": b.name, Relation: b.relation, "Date of Birth": HMS.fmtDate(b.dob), Age: HMS.age(b.dob), Gender: b.gender,
      "Blood Group": b.bloodGroup || "", "Regn No": b.regnNo || "", "Old Book No": b.oldBookNo || "", Status: HMS.svc.effectiveStatus(b), "Valid Upto": HMS.fmtDate(b.validUpto) })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Beneficiaries");
    XLSX.writeFile(wb, "beneficiaries_" + HMS.todayISO() + ".xlsx");
    HMS.svc.audit("Exported beneficiaries", "export", "", rows.length + " rows");
  };
  render();
})();
