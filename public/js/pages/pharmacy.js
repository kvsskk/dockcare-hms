(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("pharmacy");
  HMS.layout.render({ page: "pharmacy", title: "Pharmacy", crumb: "Pharmacy" });
  if (!HMS.auth.can("pharmacy")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const S = HMS.store, O = HMS.opd, st = S.settings();
  let view = "dispense", tab = "pending", selId = null;

  // ---------- dispense ----------
  const visitsWith = (fn) => { const ids = new Set(S.filter("rxItems", fn).map((r) => r.visitId)); return Array.from(ids).map((id) => O.visit(id)).filter(Boolean); };
  const TABS = [["pending", "To dispense", () => visitsWith((r) => r.qtyDispensed < r.qty).sort((a, b) => (a.consult.completedAt || "").localeCompare(b.consult.completedAt || ""))],
    ["done", "Dispensed today", () => visitsWith((r) => r.qtyDispensed > 0 && r.dispensedAt && HMS.localISO(new Date(r.dispensedAt)) === HMS.todayISO()).sort((a, b) => b.id - a.id)]];

  function renderList() {
    $("#tabs").innerHTML = TABS.map((t) => '<li class="nav-item"><a class="nav-link' + (t[0] === tab ? " active" : "") + '" href="#" data-tab="' + t[0] + '">' + t[1] + ' <span class="badge text-bg-light">' + t[2]().length + "</span></a></li>").join("");
    const list = TABS.find((t) => t[0] === tab)[2]();
    $("#list").innerHTML = list.length ? list.map((v) => { const b = O.ben(v), n = S.filter("rxItems", (r) => r.visitId === v.id).length;
      return '<tr class="clickable' + (v.id === selId ? " selected" : "") + '" data-id="' + v.id + '"><td><b>' + h(b.name) + '</b><div class="small text-muted"><span class="mono">' + h(v.visitNo) + "</span> · " + n + " item" + (n > 1 ? "s" : "") + " · " + h(O.doctorName(v.doctor)) + "</div></td></tr>"; }).join("")
      : '<tr><td class="empty"><i class="bi bi-inbox"></i>Nothing here</td></tr>';
  }

  function renderDetail() {
    const v = selId && O.visit(selId);
    if (!v) { $("#detail").innerHTML = '<div class="empty"><i class="bi bi-hand-index"></i>Select a prescription</div>'; return; }
    const b = O.ben(v), items = S.filter("rxItems", (r) => r.visitId === v.id);
    const pending = items.some((r) => r.qtyDispensed < r.qty);
    $("#detail").innerHTML =
      '<div class="card-header"><div><h3>' + h(b.name) + ' <span class="text-muted fw-normal small">· ' + HMS.age(b.dob) + " Y / " + h((b.gender || "")[0]) + '</span></h3><div class="sub"><span class="mono">' + h(v.visitNo) + "</span> · " + h(b.relation) + " of " + h(v.empCode) + " · " + h(O.doctorName(v.doctor)) + " · " + h(v.consult.diagnosis.join(", ")) + "</div></div>" +
      '<span class="ms-auto">' + (b.allergies ? '<span class="chip chip-red"><i class="bi bi-exclamation-triangle"></i> Allergy: ' + h(b.allergies) + "</span>" : "") + "</span></div>" +
      '<div class="card-body pb-0"><div class="note note-info"><i class="bi bi-sort-down"></i><div>Batches are picked automatically with the <b>earliest expiry first</b>. Expired batches are never issued.</div></div></div>' +
      '<div class="table-responsive"><table class="table"><thead><tr><th>Medicine</th><th>Dosage</th><th class="text-end">Prescribed</th><th class="text-end">Given</th><th>Batch (FEFO)</th><th class="text-end">Stock</th><th style="width:110px">Dispense</th><th class="text-end">Amount</th></tr></thead><tbody>' +
      items.map((r) => { const d = O.drug(r.drugId), left = r.qty - r.qtyDispensed, stock = O.stock(d.id), first = O.batches(d.id)[0];
        const def = Math.min(left, stock);
        return "<tr><td><b>" + h(d.name) + '</b><div class="small text-muted">' + HMS.fmtMoney(d.rate) + " each</div></td><td>" + h(r.dosage) + " × " + r.days + 'd<div class="small text-muted">' + h(r.instruction) + '</div></td><td class="text-end">' + r.qty + '</td><td class="text-end">' + r.qtyDispensed +
          "</td><td>" + (first ? '<span class="mono">' + h(first.batchNo) + '</span><div class="small text-muted">exp ' + h(HMS.fmtDate(first.expiry)) + "</div>" : "–") + '</td><td class="text-end">' + (stock < left ? '<span class="chip chip-amber">' + stock + "</span>" : stock) +
          "</td><td>" + (left > 0 ? '<input class="form-control form-control-sm" type="number" min="0" max="' + Math.min(left, stock) + '" step="1" data-rx="' + r.id + '" data-rate="' + d.rate + '" value="' + def + '" aria-label="Quantity">' : '<span class="chip chip-green">Done</span>') +
          '</td><td class="text-end" data-amt="' + r.id + '"></td></tr>'; }).join("") +
      '</tbody><tfoot><tr><td colspan="7" class="text-end fw-semibold">Charged to employee code ' + h(v.empCode) + '</td><td class="text-end fw-bold" id="tot"></td></tr></tfoot></table></div>' +
      '<div class="card-body border-top d-flex gap-2 align-items-center"><span class="text-muted small">Dispensed by ' + h(HMS.auth.current().name) + "</span>" +
      (pending ? '<button class="btn btn-primary ms-auto" id="dispBtn"><i class="bi bi-check2-circle me-1"></i>Dispense</button>' : '<span class="chip chip-green ms-auto">Fully dispensed</span>') + "</div>";
    const calc = () => { let t = 0; HMS.$$("[data-rx]").forEach((i) => { const a = (parseInt(i.value, 10) || 0) * Number(i.dataset.rate); t += a; $('[data-amt="' + i.dataset.rx + '"]').textContent = HMS.fmtMoney(a.toFixed(2)); }); $("#tot").textContent = HMS.fmtMoney(t.toFixed(2)); };
    $("#detail").oninput = calc; calc();
    if ($("#dispBtn")) $("#dispBtn").onclick = () => {
      const lines = HMS.$$("[data-rx]").map((i) => ({ rxItemId: Number(i.dataset.rx), qty: parseInt(i.value, 10) || 0 }));
      try {
        const total = O.dispense(v.id, lines);
        HMS.toast("Dispensed – " + HMS.fmtMoney(total.toFixed(2)) + " charged to " + v.empCode);
        if (!O.pendingRx(v.id).length) { const next = TABS[0][2]()[0]; selId = next ? next.id : null; }
        renderList(); renderDetail();
      } catch (err) { HMS.toast(err.message, "danger"); }
    };
  }

  // ---------- stock ----------
  function drugRows() {
    const t = HMS.todayISO(), alertTo = HMS.addDays(t, st.expiryAlertDays || 90);
    return S.all("drugs").map((d) => { const bs = O.batches(d.id), stock = bs.reduce((s, b) => s + b.qty, 0), exp = bs[0] ? bs[0].expiry : null;
      return { d, stock, exp, low: stock > 0 && stock < d.reorder, out: stock === 0, near: exp && exp <= alertTo }; });
  }
  function renderStock() {
    const all = drugRows();
    const q = HMS.clean($("#stockQ").value).toLowerCase(), f = $("#stockF").value;
    const list = all.filter((r) => (!q || r.d.name.toLowerCase().includes(q) || r.d.code.toLowerCase().includes(q)) && (!f || (f === "low" && r.low) || (f === "exp" && r.near) || (f === "out" && r.out)));
    const value = S.filter("batches", (b) => b.qty > 0 && b.expiry > HMS.todayISO()).reduce((s, b) => s + b.qty * (b.cost || 0), 0);
    const k = (icon, l, v, d, c) => '<div class="col-sm-6 col-xl-3"><div class="card kpi p-3 h-100"><div class="l"><i class="bi bi-' + icon + '"></i>' + l + '</div><div class="v"' + (c ? ' style="color:' + c + '"' : "") + ">" + v + '</div><div class="d">' + d + "</div></div></div>";
    $("#stockKpis").innerHTML = k("currency-rupee", "Stock value", HMS.fmtMoney(Math.round(value)), all.length + " medicines") + k("arrow-down-circle", "Below reorder level", all.filter((r) => r.low).length, "Raise indent", "var(--amber)") +
      k("hourglass-bottom", "Near expiry", all.filter((r) => r.near).length, "Within " + (st.expiryAlertDays || 90) + " days", "var(--amber)") + k("x-octagon", "Out of stock", all.filter((r) => r.out).length, "", "var(--red)");
    $("#stockBody").innerHTML = list.map((r) => '<tr><td class="mono">' + h(r.d.code) + "</td><td><b>" + h(r.d.name) + '</b></td><td class="text-end">' + r.stock + '</td><td class="text-end text-muted">' + r.d.reorder + "</td><td>" + h(HMS.fmtDate(r.exp)) + '</td><td class="text-end">' + HMS.fmtMoney(r.d.rate) + "</td><td>" +
      (r.out ? '<span class="chip chip-red">Out of stock</span>' : "") + (r.low ? '<span class="chip chip-amber">Low</span> ' : "") + (r.near ? '<span class="chip chip-amber">Near expiry</span>' : "") + (!r.out && !r.low && !r.near ? '<span class="chip chip-green">OK</span>' : "") + "</td></tr>").join("") ||
      '<tr><td colspan="7" class="empty">No medicines match</td></tr>';
    const expired = S.filter("batches", (b) => b.qty > 0 && b.expiry <= HMS.todayISO());
    $("#expired").innerHTML = expired.length ? '<div class="note note-err"><i class="bi bi-trash3"></i><div><b>Expired batches still on shelf – remove and write off:</b> ' + expired.map((b) => h(O.drug(b.drugId).name) + " batch " + h(b.batchNo) + " (" + b.qty + ", expired " + h(HMS.fmtDate(b.expiry)) + ")").join("; ") + "</div></div>" : '<span class="text-muted small">No expired stock.</span>';
  }
  $("#stockQ").oninput = HMS.debounce(renderStock, 200); $("#stockF").onchange = renderStock;

  // ---------- receive ----------
  $("#rDrug").innerHTML = '<option value="">Select medicine</option>' + S.all("drugs").map((d) => '<option value="' + d.id + '">' + h(d.name) + " (" + h(d.code) + ")</option>").join("");
  function renderReceipts() {
    const list = S.filter("stockMoves", (m) => m.type === "receipt").slice(-15).reverse();
    $("#recList").innerHTML = list.length ? list.map((m) => { const b = S.get("batches", m.batchId); return "<tr><td>" + h(HMS.fmtDateTime(m.at)) + "</td><td>" + h(O.drug(m.drugId).name) + '</td><td class="mono">' + h(b.batchNo) + "</td><td>" + h(HMS.fmtDate(b.expiry)) + '</td><td class="text-end">' + m.qty + "</td></tr>"; }).join("")
      : '<tr><td colspan="5" class="text-muted text-center py-3">No receipts yet</td></tr>';
  }
  $("#recForm").onsubmit = (e) => {
    e.preventDefault();
    try {
      O.receiveStock({ drugId: $("#rDrug").value, batchNo: $("#rBatch").value, expiry: $("#rExpiry").value, qty: Number($("#rQty").value), cost: $("#rCost").value, supplier: $("#rSupplier").value, invoice: $("#rInvoice").value });
      HMS.toast("Stock added"); e.target.reset(); renderReceipts();
    } catch (err) { HMS.toast(err.message, "danger"); }
  };

  // ---------- views ----------
  function show(vw) {
    view = vw;
    HMS.$$("#views .nav-link").forEach((a) => a.classList.toggle("active", a.dataset.view === vw));
    $("#vDispense").hidden = vw !== "dispense"; $("#vStock").hidden = vw !== "stock"; $("#vReceive").hidden = vw !== "receive";
    if (vw === "dispense") { renderList(); renderDetail(); } if (vw === "stock") renderStock(); if (vw === "receive") renderReceipts();
  }
  $("#views").onclick = (e) => { const a = e.target.closest("[data-view]"); if (a) { e.preventDefault(); show(a.dataset.view); } };
  $("#tabs").onclick = (e) => { const a = e.target.closest("[data-tab]"); if (!a) return; e.preventDefault(); tab = a.dataset.tab; selId = (TABS.find((t) => t[0] === tab)[2]()[0] || {}).id || null; renderList(); renderDetail(); };
  $("#list").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (!tr) return; selId = Number(tr.dataset.id); renderList(); renderDetail(); };
  selId = (TABS[0][2]()[0] || {}).id || null;
  show(HMS.param("view") || "dispense");
  setInterval(() => { if (view === "dispense" && !document.querySelector("#detail:focus-within")) renderList(); }, 20000);
})();
