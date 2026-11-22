(function () {
  "use strict";
  const { h, $ } = HMS;
  HMS.auth.require("dependent");
  const editId = Number(HMS.param("id")) || null;
  HMS.layout.render({ page: "dependent", title: editId ? "Correct Dependent" : "Add Dependent", crumb: "Patients / Beneficiaries" });
  if (!HMS.auth.can("dependent")) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-lock"></i>You do not have access to this screen.</div>'; return; }

  const st = HMS.store.settings();
  let emp = null, photo = null, documents = [], stream = null, sigDirty = false;

  $("#relation").innerHTML = '<option value="">Select</option>' + st.allowedRelations.map((r) => "<option>" + h(r) + "</option>").join("");

  // ---------- employee lookup ----------
  function lookup() {
    const code = HMS.clean($("#empCode").value).toUpperCase();
    $("#empCode").value = code;
    emp = HMS.svc.employee(code);
    if (!code) { $("#empInfo").innerHTML = '<span class="text-muted">Enter the employee code and press Enter.</span>'; }
    else if (!emp) { $("#empInfo").innerHTML = '<div class="note note-err py-2"><i class="bi bi-x-circle"></i><div>No employee with code <b>' + h(code) + "</b> in the HR master.</div></div>"; }
    else {
      const fam = HMS.svc.family(emp.code);
      $("#empInfo").innerHTML = '<div class="d-flex gap-4 flex-wrap"><div><div class="small text-muted">Employee name</div><b>' + h(emp.name) + '</b></div><div><div class="small text-muted">Designation / Dept.</div>' +
        h(emp.designation) + " · " + h(emp.department) + '</div><div><div class="small text-muted">Grade</div>' + h(emp.grade) + '</div><div><div class="small text-muted">HR status</div><span class="chip ' +
        (emp.status === "active" ? "chip-green" : "chip-red") + '">' + h(emp.status) + '</span></div><div><div class="small text-muted">Registered family</div>' + fam.map((b) => h(b.relation)).join(", ") + "</div></div>";
    }
    runChecks();
  }
  $("#empCode").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } });
  $("#empCode").addEventListener("change", lookup);
  $("#findEmp").onclick = lookup;
  $("#sameAddr").onclick = () => { if (emp) { $("#address").value = emp.address || ""; } };

  // ---------- form data + live checks ----------
  function data() {
    const inc = $("#income").value;
    return {
      empCode: HMS.clean($("#empCode").value).toUpperCase(), name: HMS.clean($("#name").value), relation: $("#relation").value,
      dob: $("#dob").value, gender: $("#gender").value, bloodGroup: $("#bloodGroup").value, aadhaar: $("#aadhaar").value.replace(/\D/g, ""),
      mobile: $("#mobile").value.replace(/\D/g, ""), income: inc === "" ? null : Number(inc), idMarks: HMS.clean($("#idMarks").value),
      oldBookNo: HMS.clean($("#oldBookNo").value), address: HMS.clean($("#address").value),
      photo, signature: sigDirty ? sig.toDataURL("image/png") : (editId ? (HMS.svc.beneficiary(editId) || {}).signature : null), documents,
    };
  }
  function runChecks() {
    const d = data();
    $("#incomeWrap").style.display = d.relation === "Father" || d.relation === "Mother" ? "" : "none";
    const checks = HMS.svc.checkEligibility(d, { ignoreId: editId });
    if (!d.name) checks.unshift({ level: "err", title: "Name missing", detail: "Enter the full name" });
    if (!d.gender) checks.push({ level: "err", title: "Gender missing", detail: "Select gender" });
    if (!documents.length) checks.push({ level: "warn", title: "No documents attached", detail: "Approver may return the request" });
    const icon = { ok: "check-circle-fill text-success", warn: "exclamation-triangle-fill text-warning", err: "x-circle-fill text-danger" };
    $("#checks").innerHTML = checks.map((c) => '<div class="check-row"><i class="bi bi-' + icon[c.level] + '"></i><div><b>' + h(c.title) + '</b><div class="text-muted small">' + h(c.detail) + "</div></div></div>").join("");
    const blocked = checks.some((c) => c.level === "err");
    $("#submitBtn").disabled = blocked;
    return !blocked;
  }
  $("#depForm").addEventListener("input", HMS.debounce(runChecks, 200));
  $("#depForm").addEventListener("change", runChecks);

  // ---------- photo: webcam or upload ----------
  function showPhoto() { $("#photoBox").innerHTML = photo ? '<img src="' + photo + '" alt="Photo">' : '<div><i class="bi bi-camera fs-3 d-block"></i>No photo</div>'; }
  function stopCam() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } $("#snapBtn").hidden = true; }
  $("#camBtn").onclick = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return HMS.toast("Camera not available in this browser. Upload a photo instead.", "warning");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      $("#photoBox").innerHTML = '<video autoplay playsinline muted></video>';
      $("#photoBox video").srcObject = stream;
      $("#snapBtn").hidden = false;
    } catch (e) { HMS.toast("Camera permission denied or no camera found.", "warning"); }
  };
  $("#snapBtn").onclick = async () => {
    const v = $("#photoBox video"); if (!v) return;
    const c = document.createElement("canvas");
    const w = v.videoHeight * 0.82; c.width = w; c.height = v.videoHeight; // portrait crop
    c.getContext("2d").drawImage(v, (v.videoWidth - w) / 2, 0, w, v.videoHeight, 0, 0, w, v.videoHeight);
    photo = await HMS.shrinkImage(c.toDataURL("image/jpeg", 0.9), 240, 290, 0.75);
    stopCam(); showPhoto();
  };
  $("#photoFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!f.type.startsWith("image/")) return HMS.toast("Choose an image file", "warning");
    stopCam(); photo = await HMS.shrinkImage(f, 240, 290, 0.75); showPhoto(); e.target.value = "";
  };

  // ---------- signature pad ----------
  const sig = $("#sigPad");
  function sizePad() { const r = sig.getBoundingClientRect(); sig.width = r.width; sig.height = r.height; const ctx = sig.getContext("2d"); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0E2A47"; }
  sizePad();
  let drawing = false;
  const pos = (e) => { const r = sig.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  sig.addEventListener("pointerdown", (e) => { drawing = true; sig.setPointerCapture(e.pointerId); const ctx = sig.getContext("2d"); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  sig.addEventListener("pointermove", (e) => { if (!drawing) return; const ctx = sig.getContext("2d"); ctx.lineTo(...pos(e)); ctx.stroke(); sigDirty = true; });
  ["pointerup", "pointercancel"].forEach((ev) => sig.addEventListener(ev, () => (drawing = false)));
  $("#sigClear").onclick = () => { sig.getContext("2d").clearRect(0, 0, sig.width, sig.height); sigDirty = false; };

  // ---------- documents (demo stores file name and size; files go to Supabase Storage when connected) ----------
  function renderDocs() {
    $("#docList").innerHTML = documents.map((d, i) => '<div class="d-flex align-items-center gap-2 border rounded p-2 mb-1"><i class="bi bi-file-earmark-check text-success"></i><b>' + h(d.name) +
      '</b><span class="text-muted small">' + Math.round(d.size / 1024) + ' KB</span><button type="button" class="btn btn-sm btn-link text-danger ms-auto" data-rm="' + i + '">Remove</button></div>').join("");
    runChecks();
  }
  function addFiles(files) {
    Array.from(files).forEach((f) => {
      if (f.size > 2 * 1024 * 1024) return HMS.toast(f.name + " is larger than 2 MB", "warning");
      if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return HMS.toast(f.name + ": only PDF, JPG or PNG", "warning");
      documents.push({ name: f.name, size: f.size, type: f.type });
    });
    renderDocs();
  }
  $("#docFile").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
  const dz = $("#docDrop");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("drag"); addFiles(e.dataTransfer.files); });
  $("#docList").onclick = (e) => { const b = e.target.closest("[data-rm]"); if (b) { documents.splice(Number(b.dataset.rm), 1); renderDocs(); } };

  // ---------- submit ----------
  $("#depForm").onsubmit = (e) => {
    e.preventDefault();
    if (!runChecks()) return HMS.toast("Fix the items marked in red first", "danger");
    try {
      const b = HMS.svc.submitDependent(data(), editId);
      stopCam();
      HMS.toast(b.name + " submitted for approval");
      setTimeout(() => (location.href = "patients.html?emp=" + encodeURIComponent(b.empCode) + "&sel=" + b.id), 700);
    } catch (err) { HMS.toast(err.message, "danger"); }
  };

  // ---------- edit mode / prefill ----------
  if (editId) {
    const b = HMS.svc.beneficiary(editId);
    if (!b || !["returned", "pending"].includes(b.status)) { $("#page").innerHTML = '<div class="empty"><i class="bi bi-exclamation-circle"></i>This record cannot be edited (only pending or returned requests).</div>'; return; }
    if (b.status === "returned") $("#returnedNote").innerHTML = '<div class="note note-info mb-3"><i class="bi bi-arrow-return-left"></i><div><b>Returned for correction:</b> ' + h(b.remarks) + "</div></div>";
    ["empCode", "name", "relation", "dob", "gender", "bloodGroup", "aadhaar", "mobile", "income", "idMarks", "oldBookNo", "address"].forEach((f) => { if (b[f] != null) $("#" + f).value = b[f]; });
    $("#empCode").readOnly = true;
    photo = b.photo; documents = (b.documents || []).slice();
    if (b.signature) { const img = new Image(); img.onload = () => sig.getContext("2d").drawImage(img, 0, 0, sig.width, sig.height); img.src = b.signature; }
    $("#submitBtn").innerHTML = '<i class="bi bi-send me-1"></i>Resubmit for approval';
    $("#cancelBtn").href = "patients.html?emp=" + encodeURIComponent(b.empCode);
    showPhoto(); renderDocs(); lookup();
  } else if (HMS.param("emp")) {
    $("#empCode").value = HMS.param("emp");
    $("#cancelBtn").href = "patients.html?emp=" + encodeURIComponent(HMS.param("emp"));
    lookup(); $("#name").focus();
  } else { $("#empCode").focus(); runChecks(); }
})();
