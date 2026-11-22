(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("cards");
  HMS.layout.render({ page: "cards", title: "Card Issue", crumb: "Patients / Medical record cum identity card" });
  if (!HMS.auth.can("cards")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store;
  const st = S.settings();
  const TABS = [["queue", "Ready to print", (b) => HMS.svc.effectiveStatus(b) === "active" && !b.cardPrints],
    ["printed", "Printed (reprint)", (b) => HMS.svc.effectiveStatus(b) === "active" && b.cardPrints > 0]];
  let tab = "queue";
  const selected = new Set();
  const one = Number(HMS.param("id"));
  if (one) { const b = HMS.svc.beneficiary(one); if (b) { selected.add(one); tab = b.cardPrints ? "printed" : "queue"; } }

  /** Bilingual card – same fields as the paper medical book. */
  function cardFront(b, e) {
    const L = (hi, en, v, extra) => '<div' + (extra || "") + '><div class="lab"><span class="hi">' + hi + "</span> " + en + '</div><div class="val">' + (v || "—") + "</div></div>";
    return '<div class="hcard"><div class="hh"><div class="lg"><i class="bi bi-life-preserver"></i></div><div class="t"><span class="hi" style="color:#fff">चिकित्सा रिकॉर्ड सह पहचान पत्र</span><b>MEDICAL RECORD CUM IDENTITY CARD</b><span>' +
      h(st.hospitalName) + " · " + h(st.city) + '</span></div><div class="regn"><span><span class="hi">पंजीकरण सं.</span> Regn. No.</span><b>' + h(b.regnNo) + "</b></div></div>" +
      '<div style="display:flex;gap:2.5mm;padding:2mm 3mm 0">' +
      '<div style="width:14mm;flex-shrink:0"><div class="photo">' + (b.photo ? '<img src="' + b.photo + '" alt="">' : '<i class="bi bi-person"></i>') + "</div>" +
      '<div style="margin-top:1mm">' + HMS.qrImg(b.regnNo + "|" + b.empCode, 50) + "</div></div>" +
      '<div style="flex:1;display:grid;grid-template-columns:1.3fr 1fr;gap:1.1mm 2mm;align-content:start">' +
      L("रोगी का नाम", "Name of the Patient", '<span style="font-size:7.6pt">' + h(b.name.toUpperCase()) + "</span>", ' style="grid-column:span 2"') +
      L("संबंध", "Relationship", h(b.relation)) + L("लिंग", "Sex", h(b.gender)) +
      L("जन्म तिथि", "Date of Birth", h(HMS.fmtDate(b.dob))) + L("ब्लड ग्रुप", "Blood Group", '<span style="color:#B91C1C">' + h(b.bloodGroup || "—") + "</span>") +
      L("पहचान चिह्न", "Identification Marks", h(b.idMarks), ' style="grid-column:span 2"') +
      L("कर्मचारी का नाम", "Name of the Employee", h(e.name)) + L("कर्मचारी कोड", "Employee Code", '<span class="mono">' + h(e.code) + "</span>") +
      "</div></div>" +
      '<div class="ft"><span><span class="hi">वैधता</span> Valid upto <b>' + h(HMS.fmtDate(b.validUpto)) + '</b></span><span style="margin-left:auto">' +
      (b.oldBookNo ? '<span class="hi">पुरानी पुस्तिका सं.</span> Old Book No. <b>' + h(b.oldBookNo) + "</b>" : "") + "</span></div></div>";
  }
  function cardBack(b, e) {
    const L = (hi, en, v, extra) => '<div' + (extra || "") + '><div class="lab"><span class="hi">' + hi + "</span> " + en + '</div><div class="val">' + (v || "—") + "</div></div>";
    return '<div class="hcard" style="padding:3mm 3.5mm;display:flex;flex-direction:column;gap:1.6mm">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.1mm 2mm">' + L("पदनाम", "Designation", h(e.designation)) + L("विभाग", "Department", h(e.department)) +
      L("श्रेणी", "Grade", h(e.grade)) + L("जारी करने की तिथि", "Date of Issue", h(HMS.fmtDate(HMS.todayISO()))) +
      L("पता", "Address", '<span style="font-size:5.8pt;font-weight:600">' + h(b.address || e.address) + "</span>", ' style="grid-column:span 2"') + "</div>" +
      '<div style="background:#F3F6F9;border-radius:1.5mm;padding:1.2mm 1.8mm;font-size:5pt;line-height:1.45;color:#3B4757">' +
      '<div class="hi">• प्रत्येक बार अस्पताल आने पर यह कार्ड प्रस्तुत करें।</div><div>• Present this card at every hospital visit. Valid only for the person named.</div><div>• Loss of card must be reported to Hospital Administration.</div></div>' +
      '<div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end">' +
      '<div style="text-align:center">' + (b.signature ? '<img src="' + b.signature + '" alt="" style="height:7mm;max-width:24mm">' : '<div style="width:24mm;height:7mm;border:.3mm dashed #C8D2DE;border-radius:1mm"></div>') +
      '<div class="lab"><span class="hi">कर्मचारी के हस्ताक्षर / निशानी</span><br>Employee\'s Signature / LTI</div></div>' +
      '<div style="text-align:center"><div style="width:26mm;height:7mm"></div><div class="lab" style="border-top:.2mm solid #9AA5B4;padding-top:.6mm"><span class="hi">जारीकर्ता प्राधिकारी</span><br>Issuing Authority</div></div></div></div>';
  }

  function rows() {
    const q = HMS.clean($("#filter").value).toLowerCase();
    return S.filter("beneficiaries", TABS.find((t) => t[0] === tab)[2])
      .filter((b) => !q || b.name.toLowerCase().includes(q) || b.empCode.toLowerCase() === q || (b.regnNo || "").toLowerCase().includes(q))
      .sort((a, b) => String(b.approvedAt || "").localeCompare(String(a.approvedAt || "")));
  }

  function renderList() {
    $("#tabs").innerHTML = TABS.map((t) => '<li class="nav-item"><a class="nav-link' + (t[0] === tab ? " active" : "") + '" href="#" data-tab="' + t[0] + '">' + t[1] + ' <span class="badge text-bg-light">' + S.filter("beneficiaries", t[2]).length + "</span></a></li>").join("");
    const list = rows().slice(0, 300);
    $("#list").innerHTML = list.length ? list.map((b) => '<tr><td><input class="form-check-input" type="checkbox" data-id="' + b.id + '"' + (selected.has(b.id) ? " checked" : "") + ' aria-label="Select"></td><td><b>' + h(b.name) +
      '</b><div class="small text-muted">' + h(b.relation) + " · " + h(b.empCode) + '</div></td><td class="mono">' + h(b.regnNo) + '</td><td class="small text-muted">' + (b.cardPrints ? h(HMS.fmtDate(b.cardPrintedAt.slice(0, 10))) + " (" + b.cardPrints + "×)" : "—") + "</td></tr>").join("")
      : '<tr><td colspan="4" class="empty"><i class="bi bi-inbox"></i>Nothing to print</td></tr>';
    $("#selCount").textContent = selected.size + " selected";
    $("#printBtn").disabled = !selected.size;
  }

  function renderPreview() {
    const list = Array.from(selected).map((id) => HMS.svc.beneficiary(id)).filter((b) => b && HMS.svc.effectiveStatus(b) === "active");
    if (!list.length) { $("#preview").innerHTML = '<div class="empty"><i class="bi bi-person-vcard"></i>Select beneficiaries to preview their cards</div>'; return; }
    const shown = list.slice(0, 20);
    $("#preview").innerHTML = shown.map((b) => { const e = HMS.svc.employee(b.empCode) || {}; return '<div class="scale">' + cardFront(b, e) + '</div><div class="scale">' + cardBack(b, e) + "</div>"; }).join("") +
      (list.length > 20 ? '<div class="w-100 text-center text-muted no-print">Showing first 20 of ' + list.length + " – print in batches of 20.</div>" : "");
  }

  $("#tabs").onclick = (e) => { const a = e.target.closest("[data-tab]"); if (!a) return; e.preventDefault(); tab = a.dataset.tab; selected.clear(); renderList(); renderPreview(); };
  $("#filter").oninput = HMS.debounce(renderList, 200);
  $("#list").onchange = (e) => { const c = e.target.closest("[data-id]"); if (!c) return; const id = Number(c.dataset.id); c.checked ? selected.add(id) : selected.delete(id); renderList(); renderPreview(); };
  $("#all").onchange = (e) => { rows().slice(0, 20).forEach((b) => (e.target.checked ? selected.add(b.id) : selected.delete(b.id))); renderList(); renderPreview(); };
  $("#printBtn").onclick = () => {
    const ids = Array.from(selected).slice(0, 20);
    window.print();
    // record after the print dialog closes
    setTimeout(async () => {
      if (await HMS.confirm("Did the cards print correctly?", "<p>Confirm to record " + ids.length + " card" + (ids.length > 1 ? "s" : "") + " as printed. Choose Cancel to keep them in the queue.</p>", "Yes, record as printed")) {
        ids.forEach((id) => HMS.svc.recordCardPrint(id));
        selected.clear(); HMS.toast(ids.length + " card(s) recorded as printed"); renderList(); renderPreview();
      }
    }, 300);
  };
  renderList(); renderPreview();
})();
