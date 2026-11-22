/*
 * DockCare HMS – web server.
 * Release 0.1 serves the browser application. The API routes (Supabase connection, login,
 * business rules) are added under /api in the next build; see README.md.
 */
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

app.disable("x-powered-by");
app.use((req, res, next) => {
  // basic security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; media-src 'self' blob:; frame-ancestors 'none'");
  next();
});

app.get("/api/health", (req, res) => res.json({ status: "ok", version: require("../package.json").version, time: new Date().toISOString() }));

app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: "1h" }));
app.get("/", (req, res) => res.redirect("/login.html"));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, "login.html")));

app.listen(PORT, () => console.log(`DockCare HMS running at http://localhost:${PORT}`));
