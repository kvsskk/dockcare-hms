/*
 * Login, session and page access.
 * Demo mode checks users stored in this browser. When connected, login goes to Supabase Auth
 * through the server and the server re-checks the role on every request.
 */
(function (HMS) {
  "use strict";
  const SKEY = "hms_session";
  const LKEY = "hms_lockout";
  const MAX_TRIES = 5, LOCK_MIN = 15;

  /** Which roles may open which page. Pages not listed here are open to every signed-in user. */
  const ACCESS = {
    patients: ["reception", "nurse", "doctor", "hr", "admin"],
    dependent: ["reception", "nurse", "admin"],
    approvals: ["hr", "admin"],
    cards: ["reception", "admin"],
    employees: ["reception", "accounts", "hr", "admin"],
    import: ["hr", "admin"],
    settings: ["admin"],
    users: ["admin"],
    audit: ["admin"],
    opd: ["reception", "admin"],
    vitals: ["nurse", "admin"],
    consult: ["doctor", "admin"],
    lab: ["lab", "admin"],
    pharmacy: ["pharmacy", "admin"],
    charges: ["accounts", "reception", "admin"],
  };

  function readLock() { try { return JSON.parse(localStorage.getItem(LKEY) || "{}"); } catch (e) { return {}; } }

  const auth = {
    ACCESS,
    current() {
      try {
        const s = JSON.parse(sessionStorage.getItem(SKEY) || "null");
        if (!s) return null;
        const mins = HMS.store.settings().sessionMinutes || 15;
        if (Date.now() - s.lastActive > mins * 60000) { sessionStorage.removeItem(SKEY); return null; }
        return s;
      } catch (e) { return null; }
    },

    login(username, password, role) {
      username = HMS.clean(username).toLowerCase();
      const locks = readLock();
      const lk = locks[username];
      if (lk && lk.until && lk.until > Date.now()) {
        throw new Error("Account locked after " + MAX_TRIES + " wrong attempts. Try again after " + Math.ceil((lk.until - Date.now()) / 60000) + " min or contact Hospital Administration.");
      }
      const u = HMS.store.find("users", (x) => x.username === username && x.active);
      if (!u || u.password !== password || (role && u.role !== role)) {
        const tries = ((lk && lk.tries) || 0) + 1;
        locks[username] = tries >= MAX_TRIES ? { tries: 0, until: Date.now() + LOCK_MIN * 60000 } : { tries };
        localStorage.setItem(LKEY, JSON.stringify(locks));
        if (u && role && u.role !== role && u.password === password) throw new Error("This user is not a " + HMS.svc.ROLE_NAMES[role] + ". Select the correct role.");
        throw new Error("Wrong user ID or password" + (tries < MAX_TRIES ? " (" + (MAX_TRIES - tries) + " attempts left)" : ""));
      }
      delete locks[username]; localStorage.setItem(LKEY, JSON.stringify(locks));
      const s = { userId: u.id, username: u.username, name: u.name, role: u.role, loginAt: Date.now(), lastActive: Date.now() };
      sessionStorage.setItem(SKEY, JSON.stringify(s));
      HMS.svc.audit("Signed in", "user", u.username, HMS.svc.ROLE_NAMES[u.role]);
      return s;
    },

    logout(reason) {
      const s = auth.current();
      if (s) HMS.svc.audit("Signed out", "user", s.username, reason || "");
      sessionStorage.removeItem(SKEY);
      location.href = "login.html" + (reason ? "?msg=" + encodeURIComponent(reason) : "");
    },

    touch() {
      const s = auth.current(); if (!s) return;
      s.lastActive = Date.now(); sessionStorage.setItem(SKEY, JSON.stringify(s));
    },

    can(page, role) { const r = role || (auth.current() || {}).role; return !ACCESS[page] || ACCESS[page].includes(r); },

    /** Call at the top of every protected page. Returns the session or redirects to login. */
    require(page) {
      const s = auth.current();
      if (!s) { location.replace("login.html?msg=" + encodeURIComponent("Please sign in to continue")); throw new Error("redirect"); }
      auth.touch();
      ["click", "keydown"].forEach((ev) => document.addEventListener(ev, HMS.debounce(auth.touch, 2000), { passive: true }));
      setInterval(() => { if (!auth.current()) auth.logout("Signed out after inactivity"); }, 30000);
      return s;
    },
  };
  HMS.auth = auth;
})(window.HMS);
