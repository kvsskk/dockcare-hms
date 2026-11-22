"""Writes the HTML shell for each page (shared head + scripts). Page markup lives in tools/pages/<name>.html."""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · DockCare</title>
<link rel="stylesheet" href="vendor/bootstrap/bootstrap.min.css">
<link rel="stylesheet" href="vendor/bootstrap-icons/bootstrap-icons.min.css">
<link rel="stylesheet" href="css/app.css">
</head>
<body>
"""
CORE = ["vendor/bootstrap/bootstrap.bundle.min.js", "vendor/qrcode.js", "js/core/utils.js", "js/core/seed.js", "js/core/store.js",
        "js/core/seed2.js", "js/core/services.js", "js/core/opd.js", "js/core/vouchers.js", "js/core/auth.js", "js/core/layout.js"]
PAGES = {
  "login": ("Sign in", []), "dashboard": ("Dashboard", []), "patients": ("Patient Search", []),
  "dependent": ("Add Dependent", []), "approvals": ("Dependent Approvals", []), "cards": ("Card Issue", []),
  "employees": ("Employees", ["vendor/xlsx.full.min.js"]), "import": ("Data Import", ["vendor/xlsx.full.min.js"]),
  "settings": ("Settings", []), "users": ("Users & Roles", []), "audit": ("Audit Log", []),
  "opd": ("OPD Visits", []), "vitals": ("Patient Queue & Vitals", []), "consult": ("Consultation", []),
  "lab": ("Lab Worklist", []), "pharmacy": ("Pharmacy", []), "charges": ("Employee Charges", ["vendor/xlsx.full.min.js"]),
}
for name, (title, extra) in PAGES.items():
    body = (ROOT / "tools" / "pages" / (name + ".html")).read_text()
    scripts = "".join(f'<script src="{s}"></script>\n' for s in CORE + extra + [f"js/pages/{name}.js"])
    (ROOT / "public" / (name + ".html")).write_text(HEAD.format(title=title) + body.strip() + "\n" + scripts + "</body>\n</html>\n")
(ROOT / "public" / "index.html").write_text('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=login.html"><title>DockCare</title></head><body><a href="login.html">Open DockCare</a></body></html>\n')
print("pages written:", ", ".join(PAGES))
