/*
 * Data store.
 * Demo mode keeps all tables in this browser (localStorage) so the application can be used before
 * the Supabase database is connected. Pages never touch localStorage directly – they only call
 * HMS.store / HMS.svc, so switching to the server API later changes this file only.
 */
(function (HMS) {
  "use strict";
  const KEY = "hms_db_v1";
  const TABLES = ["employees", "beneficiaries", "users", "audit", "imports",
    "visits", "rxItems", "labOrders", "drugs", "batches", "stockMoves", "labTests", "charges"];
  const VERSION = 2;
  let db = null;

  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; }
    if (!db || !db.version || db.version > VERSION) { db = HMS.seed(); HMS.seedBuild2(db); save(); }
    else if (db.version < VERSION) { HMS.seedBuild2(db); save(); } // upgrade: keeps existing demo data
    return db;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) {
      HMS.toast("Browser storage is full. Remove some photos or reset demo data.", "danger");
      throw e;
    }
  }

  // another tab (e.g. reception) changed the data – reload it on next access
  window.addEventListener("storage", (e) => { if (e.key === KEY) db = null; });

  function nextId(table) {
    db.seq = db.seq || {};
    db.seq[table] = (db.seq[table] || 0) + 1;
    return db.seq[table];
  }

  HMS.store = {
    TABLES,
    get db() { return load(); },
    all(table) { return load()[table]; },
    get(table, id) { return load()[table].find((r) => r.id === Number(id)) || null; },
    find(table, fn) { return load()[table].find(fn) || null; },
    filter(table, fn) { return load()[table].filter(fn); },
    insert(table, row) {
      load();
      const r = Object.assign({ id: nextId(table) }, row);
      db[table].push(r); save();
      return r;
    },
    insertMany(table, rows) {
      load();
      const out = rows.map((row) => { const r = Object.assign({ id: nextId(table) }, row); db[table].push(r); return r; });
      save(); return out;
    },
    update(table, id, patch) {
      const r = this.get(table, id);
      if (!r) throw new Error(table + " " + id + " not found");
      Object.assign(r, patch); save();
      return r;
    },
    settings() { return load().settings; },
    saveSettings(patch) { Object.assign(load().settings, patch); save(); return db.settings; },
    counter(name) { load(); db.counters = db.counters || {}; db.counters[name] = (db.counters[name] || 0) + 1; save(); return db.counters[name]; },
    reset() { localStorage.removeItem(KEY); db = null; load(); },
    sizeKB() { return Math.round((localStorage.getItem(KEY) || "").length / 1024); },
  };
})(window.HMS);
