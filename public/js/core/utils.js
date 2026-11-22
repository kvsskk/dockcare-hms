/* Shared helpers. Everything lives under the HMS namespace. */
window.HMS = window.HMS || {};

(function (HMS) {
  "use strict";

  /** Escape text for safe insertion into HTML. Use for every value that came from a user or a file. */
  HMS.h = function (v) {
    if (v === null || v === undefined) return "";
    return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };

  HMS.$ = (sel, root) => (root || document).querySelector(sel);
  HMS.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  HMS.param = (name) => new URLSearchParams(location.search).get(name);

  /** Local (IST) calendar date as YYYY-MM-DD – never use toISOString() for "today". */
  HMS.localISO = (d) => { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  HMS.todayISO = () => HMS.localISO(new Date());
  HMS.addDays = (iso, n) => { const d = HMS.toDate(iso); d.setDate(d.getDate() + n); return HMS.localISO(d); };
  HMS.nowISO = () => new Date().toISOString();

  /** Parse "YYYY-MM-DD" (or Date) into a Date at local midnight; returns null if invalid. */
  HMS.toDate = function (v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  };

  /** Age in completed years, always calculated from date of birth. */
  HMS.age = function (dob, at) {
    const d = HMS.toDate(dob); if (!d) return null;
    const t = at ? HMS.toDate(at) : new Date();
    let a = t.getFullYear() - d.getFullYear();
    if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
    return a;
  };

  HMS.fmtDate = function (v) {
    const d = HMS.toDate(v); if (!d) return "";
    return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
  };
  HMS.fmtDateTime = function (iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return HMS.fmtDate(HMS.localISO(d)) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  HMS.fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  HMS.fmtMoney = (n) => "₹ " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  HMS.initials = (name) => String(name || "?").replace(/^(sri|smt|dr|mr|mrs|ms)\.?\s+/i, "").split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  HMS.maskAadhaar = (a) => { const d = String(a || "").replace(/\D/g, ""); return d.length >= 4 ? "XXXX XXXX " + d.slice(-4) : ""; };
  HMS.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 250); }; };
  HMS.clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  /** Toast message in the bottom-right corner. type: success | danger | warning | info */
  HMS.toast = function (msg, type) {
    let box = HMS.$("#toastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastBox";
      box.className = "toast-container position-fixed bottom-0 end-0 p-3";
      document.body.appendChild(box);
    }
    const icon = { success: "check-circle-fill", danger: "x-circle-fill", warning: "exclamation-triangle-fill", info: "info-circle-fill" }[type || "success"];
    const el = document.createElement("div");
    el.className = "toast align-items-center border-0 text-bg-" + (type === "warning" ? "warning" : type || "success");
    el.setAttribute("role", "status");
    el.innerHTML = '<div class="d-flex"><div class="toast-body"><i class="bi bi-' + icon + ' me-2"></i>' + HMS.h(msg) +
      '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>';
    box.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3500 });
    el.addEventListener("hidden.bs.toast", () => el.remove());
    t.show();
  };

  /** Promise-based confirm dialog using a Bootstrap modal. */
  HMS.confirm = function (title, body, okLabel, okClass) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = '<div class="modal fade" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
        '<div class="modal-header"><h5 class="modal-title">' + HMS.h(title) + '</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
        '<div class="modal-body">' + body + '</div><div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>' +
        '<button class="btn ' + (okClass || "btn-primary") + '" data-ok>' + HMS.h(okLabel || "OK") + "</button></div></div></div></div>";
      document.body.appendChild(wrap);
      const m = new bootstrap.Modal(wrap.firstChild);
      let ok = false;
      wrap.querySelector("[data-ok]").onclick = () => { ok = true; m.hide(); };
      wrap.firstChild.addEventListener("hidden.bs.modal", () => { wrap.remove(); resolve(ok); });
      m.show();
    });
  };

  HMS.downloadText = function (filename, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime || "text/plain" }));
    a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /** Print a block of HTML on its own (slip, report, statement) without the page around it. */
  HMS.printHTML = function (html) {
    let root = document.getElementById("printRoot");
    if (!root) { root = document.createElement("div"); root.id = "printRoot"; document.body.appendChild(root); }
    root.innerHTML = html;
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  };

  /** Render a QR code as an <img> tag string (uses vendor/qrcode.js). */
  HMS.qrImg = function (text, sizePx) {
    const q = qrcode(0, "M"); q.addData(String(text)); q.make();
    const cell = Math.max(1, Math.floor((sizePx || 96) / (q.getModuleCount() + 2)));
    return q.createImgTag(cell, cell).replace("<img ", '<img alt="QR code" style="width:' + (sizePx || 96) + 'px;height:' + (sizePx || 96) + 'px;image-rendering:pixelated" ');
  };

  /** Shrink an image (data URL or File) to fit maxW x maxH and return a JPEG data URL. */
  HMS.shrinkImage = function (src, maxW, maxH, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(maxW / img.width, maxH / img.height, 1);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality || 0.75));
      };
      img.onerror = reject;
      if (src instanceof Blob) { const fr = new FileReader(); fr.onload = () => (img.src = fr.result); fr.readAsDataURL(src); }
      else img.src = src;
    });
  };
})(window.HMS);
