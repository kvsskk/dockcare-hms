# DockCare – Hospital Management System

Web application for the shipyard hospital: one record for every employee and every dependent,
from registration and approval to OPD, laboratory, pharmacy and monthly payroll recovery.

**Release 0.2 – registry, approval, cards + full OPD (reception → nurse → doctor → lab → pharmacy → charges)**

Stack: HTML5, CSS3, vanilla JavaScript, Bootstrap 5, Node.js + Express, Supabase (PostgreSQL).

---

## Run it

**Option A – with the Node server (recommended)**

```bash
npm install
npm start            # http://localhost:3000
```

**Option B – no install:** open `public/login.html` in Chrome or Edge.

**Option C – online demo link (GitHub Pages):** every push to `main` publishes the `public/`
folder through `.github/workflows/pages.yml`. In the repository go to *Settings › Pages* and set
*Source* to **GitHub Actions** once. The link is `https://<account>.github.io/<repository>/`.
The online demo is demo mode only; each viewer's browser keeps its own sample data.

Demo accounts (password `Demo@123` for all):

| User ID | Role |
|---|---|
| swathi | Receptionist |
| mary | Staff Nurse |
| anitha | Medical Officer (General Medicine, Room 4) |
| mohan, sharma | Medical Officers (General Medicine) |
| slakshmi, kavitha, rvarma, dentist | Gynaecology, Paediatrics, Orthopaedics, Dental |
| ramesh | Lab Technician |
| kiran | Pharmacist |
| lavanya | Accounts Officer |
| prasad | HR Approver |
| admin | Hospital Administrator |

Release 0.1 runs in **demo mode**: sample data is generated in the browser (localStorage) so the
screens can be used and reviewed before the Supabase project exists. *Settings › Reset demo data*
restores the sample data.

---

## What is new in Release 0.2 – OPD

The complete walk-in journey, with every charge linked to the employee code:

| Step | Screen | Role | What happens |
|---|---|---|---|
| 1 | OPD Visits (`opd.html`) | Reception | Scan card QR or search · pick family member · phone no. · department & doctor (with waiting count) · **token issued (nothing printed)** · today's register, voucher reprint, cancel with reason |
| 2 | Patient Queue & Vitals (`vitals.html`) | Nurse | Queue by token (urgent first) · BP, pulse, temp, SpO₂, weight, height, BMI, sugar · out-of-range highlights · allergies saved to the patient · triage |
| 3 | Consultation (`consult.html`) | Doctor | Own queue · history and last lab results · vitals strip · allergy banner · diagnosis · prescription with **live pharmacy stock** and allergy warning · lab orders · follow-up · consultation charge posted · **three vouchers print on completion** |
| 4 | Lab Worklist (`lab.html`) | Lab technician | Sample due → collected → results with **automatic L/H flags** → verify & release (locked) · printable report · lab charge posted on release |
| 5 | Pharmacy (`pharmacy.html`) | Pharmacist | Dispense against prescription · batches picked **earliest expiry first**, expired batches never issued · partial dispensing · stock with low / near-expiry / out alerts · goods receipt |
| 6 | Employee Charges (`charges.html`) | Accounts, reception | Month-wise total per employee code (consult / lab / pharmacy) · visit-wise breakup by family member · printable statement · Excel export (summary + detail) |

Rules: a dependent pending approval (or an expired card) can only have an **emergency** visit; their charges are
**held** and released automatically when the dependent is approved. One open visit per patient per department per day.
Lab reports cannot be changed after release. Stock, prescription and charge change together on dispensing.

Amounts are full tariff. Coverage %, monthly caps and carry-forward come with the payroll cycle in Build 3.

### Vouchers (v0.2.1)

Printed **after the doctor completes the consultation** – one A4 sheet, three tear-off vouchers
(`public/js/core/vouchers.js`):

| Voucher | Contents |
|---|---|
| Patient | Name, age / gender, phone no., referral employee ID, relation, Regn. No., OPD No., doctor, diagnosis, medicines with dosage / days / instructions, tests to give, follow-up date |
| Doctor | All of the above plus complaint, allergies, vitals, clinical notes and doctor's signature block |
| Lab | Only what the lab needs: lab order no., OPD No., patient name, age / gender, phone no., referral employee ID, referring doctor, priority, tests with sample type. **Printed even when no test is ordered** – the test area is left blank for writing |

Reprint from the doctor's "Seen today" list or reception's register; every print is in the audit log.

## Release 0.1 (still included)

| Screen | File | Roles |
|---|---|---|
| Sign in (role, lockout after 5 tries, auto logout) | `login.html` | all |
| Dashboard (KPIs, quick actions, recent activity) | `dashboard.html` | all |
| Patient search & family view | `patients.html` | reception, nurse, doctor, HR, admin |
| Add / correct dependent (photo, signature/LTI, documents, live eligibility checks) | `dependent.html` | reception, nurse, admin |
| Dependent approvals (approve / return / reject, Regn. No. generation) | `approvals.html` | HR, admin |
| Card issue – bilingual medical record cum identity card, CR-80 print, batch print | `cards.html` | reception, admin |
| Employee master (search, filter, Excel export) | `employees.html` | reception, accounts, HR, admin |
| Data import from Excel (validation, auto-fixes, error report, template) | `import.html` | HR, admin |
| Settings (eligibility rules, approver, card validity) | `settings.html` | admin |
| Users & roles | `users.html` | admin |
| Audit log (filter, CSV export) | `audit.html` | admin |

Menu items for Build 2 (OPD, nurse, doctor, lab) and Build 3 (pharmacy, billing, payroll) are shown
greyed out with their build number.

### Business rules implemented

- Eligible relations, children's age limit, parents' income limit – configurable in Settings.
- Duplicate checks: Aadhaar across all beneficiaries; one father / mother per employee; spouse warning.
- Age is always calculated from date of birth, never typed or stored.
- Date-of-birth sanity checks against the employee's age.
- Approver is a setting (Hospital Admin or HR) – open decision with the hospital.
- Regn. No. format `YYMM` + `L` + running number (e.g. `2611L301`), generated on approval.
- Old medical book numbers are kept and searchable.
- Rejecting or returning requires remarks; every action is in the audit log.

### Excel import

Accepts the template (*Download template* on the import screen) **and** the hospital's existing
register layout:

- Employee details only on the first row of each family → filled down automatically.
- Extra spaces / spelling in relationship (`"Son "`, `wife`) and gender (`M`, `F`) → corrected.
- A "Designation" column that actually contains names → detected and not imported; names compared with the employee name to catch spelling differences.
- 1st January dates of birth → flagged as approximate.
- Children at or above the age limit, duplicate Aadhaar, invalid dates → flagged.

Errors are not imported; rows with warnings are imported as **Needs review** and appear in
Dependent Approvals.

---

## Project structure

```
public/                 browser application (served as static files)
  *.html                one page per screen – generated, see tools/
  css/app.css           theme and layout (Bootstrap 5 base)
  js/core/              shared code
    utils.js            helpers: HMS.h() escaping, dates, toast, confirm, QR
    store.js            data store – the ONLY file that touches storage
    seed.js, seed2.js   sample data for demo mode (seed2 adds doctors, medicines, lab tests, visit history)
    opd.js              OPD rules: visits, tokens, vitals, consultation, lab, dispensing, charges
    services.js         business rules (eligibility, approval, Regn. No., audit)
    auth.js             login, session timeout, lockout, page access by role
    layout.js           sidebar menu (by role) and top bar
  js/pages/             one script per screen
  vendor/               Bootstrap, Bootstrap Icons, qrcode-generator, SheetJS (no CDN needed)
  fonts/                Noto Sans Devanagari for Hindi text
server/server.js        Express server with security headers and /api/health
db/schema.sql           complete Supabase/PostgreSQL schema for all modules
tools/make_pages.py     builds public/*.html from tools/pages/*.html (shared head + scripts)
```

### Conventions

- Every value from a user or a file is inserted into HTML through `HMS.h()` (prevents script injection).
- Pages never read or write storage directly – only through `HMS.store` / `HMS.svc`.
- Page markup lives in `tools/pages/<name>.html`; run `npm run pages` after editing it.
- No inline scripts or event handlers (the server's Content-Security-Policy blocks them).

---

## Database (Supabase)

`db/schema.sql` creates all 28 tables for every module (registry, OPD, lab, pharmacy, billing,
payroll, audit). It is tested on PostgreSQL 16. Rules enforced by the database itself:

- one "Self" row per employee; Aadhaar unique; active beneficiaries must have a Regn. No.
- `next_regn_no()` generates Regn. Nos. safely when two counters approve at the same time
- `dispense_item()` issues medicine from the earliest-expiry batches **and** posts the charge in one
  transaction – stock can never go negative
- charges in a locked or exported payroll month cannot be changed or deleted
- the audit log is append-only
- Row Level Security is on for every table with no policies: browsers cannot read data directly;
  only the Node server (service-role key) can

### Connecting Supabase (next step)

1. Create a Supabase project in the **Mumbai (ap-south-1)** region – one for development, one for live.
2. Run `db/schema.sql` in the SQL editor.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to a `.env` file on the server (never in `public/`).
4. Build 2 adds the `/api` routes in `server/` and replaces the body of `public/js/core/store.js`
   with API calls; pages and services do not change.

---

## Roadmap

| Build | Weeks | Scope |
|---|---|---|
| 0.1 – Foundation + Build 1 | 4–8 | registry, approval, cards, import |
| 0.2 – Build 2 (OPD) | 9–12 | this release: OPD visit & token, 3-copy slip, vitals, consultation, lab, pharmacy, employee charges |
| Next | – | Supabase API connection (replace `store.js` with API calls) |
| Build 3 | 13–16 | billing rules (coverage %, caps), tariff screen, payroll cycle (review, lock, export), disputes, final settlement |
