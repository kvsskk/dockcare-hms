-- =====================================================================================
-- DockCare Hospital Management System – database schema (PostgreSQL 15+ / Supabase)
-- Run once in the Supabase SQL editor of a new project (Mumbai region), or with psql.
-- All modules are created now so later builds only add screens, not tables.
--
-- Security model: Row Level Security is ENABLED on every table with NO policies, so the
-- browser (anon key) cannot read or write anything. Only the Node.js server, using the
-- service_role key kept on the server, can access data. Every rule is enforced there and
-- by the constraints / triggers below.
-- =====================================================================================

begin;

-- ---------- helpers ----------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- settings ----------------------------------------------------------------
create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
insert into settings (key, value) values
  ('approver_role',        '"admin"'),
  ('child_age_limit',      '25'),
  ('parent_income_limit',  '9000'),
  ('allowed_relations',    '["Spouse","Son","Daughter","Father","Mother"]'),
  ('card_validity_years',  '3'),
  ('require_aadhaar',      'true'),
  ('session_minutes',      '15'),
  ('hospital_name',        '"Hospital"'),
  ('city',                 '"Visakhapatnam"');

-- ---------- users & roles -----------------------------------------------------------
create table app_users (
  id            bigint generated always as identity primary key,
  auth_user_id  uuid unique,                      -- Supabase auth.users.id
  username      text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  full_name     text not null,
  role          text not null check (role in ('reception','nurse','doctor','lab','pharmacy','accounts','hr','admin')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- employees (HR master) ---------------------------------------------------
create table employees (
  id            bigint generated always as identity primary key,
  code          text not null unique check (code ~ '^[A-Z0-9-]{2,12}$'),   -- e.g. F612, K234
  name          text not null,
  gender        text check (gender in ('Male','Female','Other')),
  dob           date,
  grade         text,
  designation   text,
  department    text,
  basic_pay     numeric(12,2),
  mobile        text,
  address       text,
  status        text not null default 'active' check (status in ('active','left','retired','deceased')),
  left_on       date,
  source        text not null default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_employees_updated before update on employees for each row execute function set_updated_at();

-- ---------- beneficiaries (employee = 'Self', plus dependents) ----------------------
create table beneficiaries (
  id              bigint generated always as identity primary key,
  emp_code        text not null references employees(code) on update cascade,
  name            text not null,
  relation        text not null check (relation in ('Self','Spouse','Son','Daughter','Father','Mother','Father-in-law','Mother-in-law','Brother','Sister')),
  gender          text check (gender in ('Male','Female','Other')),
  dob             date not null check (dob > date '1900-01-01'),
  dob_approx      boolean not null default false,
  blood_group     text check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  aadhaar         char(12) check (aadhaar ~ '^[0-9]{12}$'),
  id_marks        text,
  address         text,
  mobile          text,
  monthly_income  numeric(12,2),
  regn_no         text unique,                  -- e.g. 2611L301 – generated on approval
  old_book_no     text,
  status          text not null default 'pending' check (status in ('pending','review','returned','active','rejected','inactive')),
  valid_upto      date,
  photo_path      text,                          -- Supabase Storage object path
  signature_path  text,
  source          text not null default 'manual' check (source in ('manual','import','seed')),
  remarks         text,
  created_by      bigint references app_users(id),
  created_at      timestamptz not null default now(),
  approved_by     bigint references app_users(id),
  approved_at     timestamptz,
  card_prints     int not null default 0,
  card_printed_at timestamptz,
  updated_at      timestamptz not null default now(),
  constraint active_needs_regn check (status <> 'active' or (regn_no is not null and valid_upto is not null))
);
create trigger trg_beneficiaries_updated before update on beneficiaries for each row execute function set_updated_at();
create unique index uq_one_self_per_employee on beneficiaries (emp_code) where relation = 'Self' and status <> 'rejected';
create unique index uq_aadhaar on beneficiaries (aadhaar) where aadhaar is not null and status <> 'rejected';
create index ix_beneficiaries_emp on beneficiaries (emp_code);
create index ix_beneficiaries_status on beneficiaries (status);
create index ix_beneficiaries_name on beneficiaries (lower(name));

-- age is always calculated, never stored
create view v_beneficiaries as
  select b.*, extract(year from age(current_date, b.dob))::int as age_years,
         case when b.status = 'active' and b.valid_upto < current_date then 'expired' else b.status end as effective_status
  from beneficiaries b;

create table beneficiary_documents (
  id              bigint generated always as identity primary key,
  beneficiary_id  bigint not null references beneficiaries(id) on delete cascade,
  file_name       text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      int check (size_bytes <= 2 * 1024 * 1024),
  uploaded_by     bigint references app_users(id),
  uploaded_at     timestamptz not null default now()
);

create table beneficiary_history (
  id              bigint generated always as identity primary key,
  beneficiary_id  bigint not null references beneficiaries(id) on delete cascade,
  at              timestamptz not null default now(),
  by_user         bigint references app_users(id),
  action          text not null,
  remarks         text
);

-- Regn. No. generator: YYMM + 'L' + running number per month, e.g. 2611L301
create table regn_counters (yymm char(4) primary key, last_no int not null default 0);
create or replace function next_regn_no() returns text language plpgsql as $$
declare v_yymm char(4) := to_char(current_date, 'YYMM'); v_no int;
begin
  insert into regn_counters (yymm, last_no) values (v_yymm, 1)
    on conflict (yymm) do update set last_no = regn_counters.last_no + 1
    returning last_no into v_no;
  return v_yymm || 'L' || lpad(v_no::text, 3, '0');
end $$;

-- ---------- OPD visits -------------------------------------------------------------
create table visits (
  id               bigint generated always as identity primary key,
  visit_no         text not null unique,                 -- e.g. OP-261117-0143
  beneficiary_id   bigint not null references beneficiaries(id),
  visit_date       date not null default current_date,
  token_no         int not null,
  department       text not null,
  doctor_id        bigint references app_users(id),
  visit_type       text not null default 'fresh' check (visit_type in ('fresh','follow_up','emergency')),
  priority         text not null default 'normal' check (priority in ('normal','urgent','emergency')),
  chief_complaint  text,
  status           text not null default 'registered' check (status in ('registered','vitals_done','in_consultation','completed','cancelled')),
  created_by       bigint references app_users(id),
  created_at       timestamptz not null default now(),
  unique (visit_date, token_no)
);
create index ix_visits_beneficiary on visits (beneficiary_id);
create index ix_visits_date on visits (visit_date, status);

create table vitals (
  id             bigint generated always as identity primary key,
  visit_id       bigint not null unique references visits(id) on delete cascade,
  bp_systolic    int check (bp_systolic between 40 and 300),
  bp_diastolic   int check (bp_diastolic between 20 and 200),
  pulse          int check (pulse between 20 and 250),
  temperature_f  numeric(4,1) check (temperature_f between 90 and 110),
  spo2           int check (spo2 between 50 and 100),
  weight_kg      numeric(5,1),
  height_cm      numeric(5,1),
  random_sugar   int,
  allergies      text,
  triage         text check (triage in ('normal','urgent','emergency')),
  notes          text,
  recorded_by    bigint references app_users(id),
  recorded_at    timestamptz not null default now()
);

create table consultations (
  id              bigint generated always as identity primary key,
  visit_id        bigint not null unique references visits(id) on delete cascade,
  diagnosis       text[] not null default '{}',
  clinical_notes  text,
  follow_up_days  int,
  doctor_id       bigint references app_users(id),
  completed_at    timestamptz
);

-- ---------- laboratory -------------------------------------------------------------
create table lab_tests (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  name         text not null,
  sample_type  text,
  unit         text,
  ref_low      numeric,
  ref_high     numeric,
  ref_text     text,
  rate         numeric(10,2) not null default 0,
  active       boolean not null default true
);

create table lab_orders (
  id                   bigint generated always as identity primary key,
  order_no             text not null unique,
  visit_id             bigint not null references visits(id),
  ordered_by           bigint references app_users(id),
  priority             text not null default 'normal' check (priority in ('normal','urgent')),
  status               text not null default 'ordered' check (status in ('ordered','sample_collected','in_process','released','cancelled')),
  sample_collected_at  timestamptz,
  released_at          timestamptz,
  released_by          bigint references app_users(id),
  created_at           timestamptz not null default now()
);

create table lab_order_items (
  id            bigint generated always as identity primary key,
  lab_order_id  bigint not null references lab_orders(id) on delete cascade,
  lab_test_id   bigint not null references lab_tests(id),
  value_num     numeric,
  value_text    text,
  flag          text check (flag in ('L','H','N','A')),
  entered_by    bigint references app_users(id),
  entered_at    timestamptz,
  unique (lab_order_id, lab_test_id)
);

-- ---------- pharmacy ---------------------------------------------------------------
create table drugs (
  id             bigint generated always as identity primary key,
  code           text not null unique,
  name           text not null,
  form           text,          -- tab, cap, syrup, inj …
  strength       text,
  unit           text not null default 'unit',
  reorder_level  int not null default 0,
  sale_rate      numeric(10,2) not null default 0,
  active         boolean not null default true
);
create table suppliers (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  gstin    text,
  contact  text
);
create table goods_receipts (
  id           bigint generated always as identity primary key,
  grn_no       text not null unique,
  supplier_id  bigint references suppliers(id),
  invoice_no   text,
  received_on  date not null default current_date,
  received_by  bigint references app_users(id)
);
create table drug_batches (
  id             bigint generated always as identity primary key,
  drug_id        bigint not null references drugs(id),
  batch_no       text not null,
  expiry_date    date not null,
  grn_id         bigint references goods_receipts(id),
  qty_received   int not null check (qty_received >= 0),
  qty_available  int not null check (qty_available >= 0),     -- stock can never go negative
  unit_cost      numeric(10,2) not null default 0,
  unique (drug_id, batch_no)
);
create index ix_batches_fefo on drug_batches (drug_id, expiry_date) where qty_available > 0;

create table prescriptions (
  id          bigint generated always as identity primary key,
  visit_id    bigint not null references visits(id),
  doctor_id   bigint references app_users(id),
  created_at  timestamptz not null default now()
);
create table prescription_items (
  id               bigint generated always as identity primary key,
  prescription_id  bigint not null references prescriptions(id) on delete cascade,
  drug_id          bigint not null references drugs(id),
  dosage           text,            -- 1-0-1
  instruction      text,
  duration_days    int,
  qty_prescribed   int not null check (qty_prescribed > 0),
  qty_dispensed    int not null default 0 check (qty_dispensed >= 0),
  constraint not_over_dispensed check (qty_dispensed <= qty_prescribed)
);
create table stock_movements (
  id                    bigint generated always as identity primary key,
  batch_id              bigint not null references drug_batches(id),
  movement              text not null check (movement in ('receipt','issue','adjustment','expiry_writeoff')),
  qty                   int not null,          -- + in, - out
  prescription_item_id  bigint references prescription_items(id),
  at                    timestamptz not null default now(),
  by_user               bigint references app_users(id),
  remarks               text
);

-- ---------- billing & payroll ------------------------------------------------------
create table tariff (
  id              bigint generated always as identity primary key,
  item_type       text not null check (item_type in ('consultation','lab','procedure','pharmacy')),
  item_code       text not null,
  description     text not null,
  rate            numeric(10,2) not null check (rate >= 0),
  effective_from  date not null default current_date,
  effective_to    date,
  unique (item_type, item_code, effective_from)
);

create table billing_rules (
  id                  bigint generated always as identity primary key,
  version             int not null,
  beneficiary_group   text not null check (beneficiary_group in ('Self','Spouse','Children','Parents','Other')),
  hospital_share_pct  numeric(5,2) not null check (hospital_share_pct between 0 and 100),
  monthly_cap         numeric(12,2),            -- null = no cap
  carry_forward       boolean not null default true,
  effective_from      date not null,
  approved_by         bigint references app_users(id),
  approved_at         timestamptz,
  unique (version, beneficiary_group)
);

create table payroll_cycles (
  id           bigint generated always as identity primary key,
  period       char(7) not null unique check (period ~ '^[0-9]{4}-[0-9]{2}$'),   -- 2026-11
  cutoff_date  date not null,
  status       text not null default 'open' check (status in ('open','review','locked','exported')),
  locked_by    bigint references app_users(id),
  locked_at    timestamptz,
  exported_at  timestamptz
);

create table charges (
  id                  bigint generated always as identity primary key,
  beneficiary_id      bigint not null references beneficiaries(id),
  emp_code            text not null references employees(code),
  visit_id            bigint references visits(id),
  source              text not null check (source in ('consultation','lab','pharmacy','procedure','adjustment')),
  source_ref          text,
  description         text not null,
  amount              numeric(12,2) not null,
  recoverable_amount  numeric(12,2) not null,       -- part recovered from salary after rules
  charge_date         date not null default current_date,
  payroll_cycle_id    bigint references payroll_cycles(id),
  created_by          bigint references app_users(id),
  created_at          timestamptz not null default now()
);
create index ix_charges_emp_date on charges (emp_code, charge_date);

-- charges in a locked or exported month cannot change; corrections are new 'adjustment' rows
create or replace function protect_locked_charges() returns trigger language plpgsql as $$
declare v_status text;
begin
  select status into v_status from payroll_cycles where id = coalesce(old.payroll_cycle_id, new.payroll_cycle_id);
  if v_status in ('locked','exported') then
    raise exception 'Payroll cycle is %; post an adjustment in the next month instead', v_status;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_charges_locked before update or delete on charges for each row execute function protect_locked_charges();

create table payroll_lines (
  id             bigint generated always as identity primary key,
  cycle_id       bigint not null references payroll_cycles(id),
  emp_code       text not null references employees(code),
  visits         int not null default 0,
  consultation   numeric(12,2) not null default 0,
  lab            numeric(12,2) not null default 0,
  pharmacy       numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  deduct_now     numeric(12,2) not null default 0,
  carry_forward  numeric(12,2) not null default 0,
  unique (cycle_id, emp_code)
);

create table disputes (
  id           bigint generated always as identity primary key,
  charge_id    bigint not null references charges(id),
  raised_by    text not null,
  reason       text not null,
  status       text not null default 'open' check (status in ('open','accepted','rejected')),
  resolution   text,
  resolved_by  bigint references app_users(id),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- Dispense one prescription item from the earliest-expiry batches and post the charge,
-- all in one transaction: stock never goes negative and no medicine is issued without a charge.
create or replace function dispense_item(p_item_id bigint, p_qty int, p_user bigint)
returns numeric language plpgsql as $$
declare
  v_item  prescription_items%rowtype;
  v_visit visits%rowtype;
  v_ben   beneficiaries%rowtype;
  v_drug  drugs%rowtype;
  v_left  int := p_qty;
  v_take  int;
  v_batch record;
  v_amount numeric(12,2) := 0;
begin
  if p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  select * into v_item from prescription_items where id = p_item_id for update;
  if not found then raise exception 'Prescription item % not found', p_item_id; end if;
  if v_item.qty_dispensed + p_qty > v_item.qty_prescribed then raise exception 'Cannot dispense more than prescribed'; end if;
  select * into v_drug from drugs where id = v_item.drug_id;
  select v.* into v_visit from visits v join prescriptions p on p.visit_id = v.id where p.id = v_item.prescription_id;
  select * into v_ben from beneficiaries where id = v_visit.beneficiary_id;

  for v_batch in
    select id, qty_available from drug_batches
     where drug_id = v_item.drug_id and qty_available > 0 and expiry_date > current_date
     order by expiry_date, id for update
  loop
    exit when v_left = 0;
    v_take := least(v_left, v_batch.qty_available);
    update drug_batches set qty_available = qty_available - v_take where id = v_batch.id;
    insert into stock_movements (batch_id, movement, qty, prescription_item_id, by_user) values (v_batch.id, 'issue', -v_take, p_item_id, p_user);
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then raise exception 'Not enough stock of %: short by %', v_drug.name, v_left; end if;

  update prescription_items set qty_dispensed = qty_dispensed + p_qty where id = p_item_id;
  v_amount := round(v_drug.sale_rate * p_qty, 2);
  insert into charges (beneficiary_id, emp_code, visit_id, source, source_ref, description, amount, recoverable_amount, created_by)
  values (v_ben.id, v_ben.emp_code, v_visit.id, 'pharmacy', 'RX-ITEM-' || p_item_id, v_drug.name || ' × ' || p_qty, v_amount, v_amount, p_user);
  return v_amount;
end $$;

-- ---------- audit & imports --------------------------------------------------------
create table audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  username   text not null,
  role       text,
  action     text not null,
  entity     text,
  ref        text,
  details    text,
  ip_address inet
);
create index ix_audit_at on audit_log (at desc);
create or replace function audit_is_append_only() returns trigger language plpgsql as $$
begin raise exception 'Audit log entries cannot be changed or deleted'; end $$;
create trigger trg_audit_append_only before update or delete on audit_log for each row execute function audit_is_append_only();

create table import_logs (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  file_name      text not null,
  imported_by    bigint references app_users(id),
  rows_read      int not null,
  imported       int not null,
  needs_review   int not null,
  errors         int not null,
  new_employees  int not null default 0
);

-- ---------- row level security: deny all to browser keys ---------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

commit;
