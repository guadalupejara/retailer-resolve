-- Schema for the Dispute Readiness + Claim Alert prototype (Supabase / Postgres 15+).
-- Run this first, then seed.sql, then storage.sql (Supabase only).
--
-- Design notes
-- * The database stores FACTS (documents, extracted fields, dates). It never stores
--   scores or priorities: src/scoring.ts computes those from the facts, so fixing
--   evidence and re-scoring is instant and every point is traceable to a rule.
-- * template_lines is the scoring template. Every template has 8 lines worth
--   35/8/8/9/20/5/5/10 = 100. Labels and checks change per code; points never do.

create extension if not exists pgcrypto;

drop table if exists audit_log, outcomes_archive, dispute_history, evidence, deductions,
  asns, shipments, invoices, purchase_orders, code_mappings, template_lines, templates,
  app_users, carriers, retailers, settings cascade;

create table settings (
  key   text primary key,
  value text not null
);

create table retailers (
  id     text primary key,
  name   text not null,
  portal text not null
);

create table carriers (
  id                 text primary key,
  name               text not null,
  pod_retention_days int  not null  -- how long the carrier keeps signed delivery paperwork
);

create table app_users (
  id   text primary key,
  name text not null,
  role text not null check (role in ('deductions_analyst','ar_manager','logistics','sales'))
);

-- ---------- Rule pack ----------
create table templates (
  id            text primary key,
  name          text not null,
  required_docs jsonb not null      -- [{doc, points, when_terms?}] ; points sum to 35
);

create table template_lines (
  id             text primary key,
  template_id    text not null references templates(id),
  line_no        int  not null check (line_no between 1 and 8),
  bucket         text not null,
  label          text not null,
  points         int  not null,
  check_key      text not null,
  fatal          boolean not null default false,  -- failing caps the score at 40
  fatal_verified boolean not null default false,  -- false = our assumption, not a published rule
  why            text,
  fix            text,
  fix_owner      text,
  source         text,
  unique (template_id, line_no)
);

create table code_mappings (
  id              text primary key,
  retailer_id     text not null references retailers(id),
  code            text not null,
  code_name       text not null,
  category        text not null,
  template_id     text references templates(id),   -- null + routed=false => generic fallback (human review)
  channel         text not null,
  window_days     int  not null,
  window_verified boolean not null default true,
  attempt_limit   int,                               -- null = no hard limit
  attempt_note    text,
  response_days   int,                               -- days to answer a retailer info request
  routed          boolean not null default false,   -- true => disputed through another channel
  source          text
);

-- ---------- Transaction records (EDI-style) ----------
create table purchase_orders (
  po_number        text primary key,
  retailer_id      text not null references retailers(id),
  ship_to          text not null,
  item_sku         text not null,
  item_description text not null,
  quantity         int  not null,
  unit_price       numeric(12,2) not null,
  order_date       date not null
);

create table invoices (
  invoice_number text primary key,
  po_number      text not null references purchase_orders(po_number),
  item_sku       text not null,
  quantity       int  not null,
  unit_price     numeric(12,2) not null,
  total          numeric(12,2) not null,
  invoice_date   date not null
);

create table shipments (
  id            text primary key,
  po_number     text not null references purchase_orders(po_number),
  terms         text not null check (terms in ('prepaid','collect')),
  carrier_id    text not null references carriers(id),
  pro_number    text not null,
  ship_date     date not null,
  delivery_date date not null
);

create table asns (
  id                 text primary key,
  po_number          text not null references purchase_orders(po_number),
  sent_at            timestamptz not null,
  received_at        timestamptz not null,
  carton_count       int not null,
  carton_ids_present boolean not null
);

-- ---------- Cases ----------
create table deductions (
  id              text primary key,
  retailer_id     text not null references retailers(id),
  code_mapping_id text not null references code_mappings(id),
  raw_code        text not null,
  title           text not null,
  po_number       text not null references purchase_orders(po_number),
  invoice_number  text not null references invoices(invoice_number),
  amount          numeric(12,2) not null,   -- what the retailer deducted
  dispute_amount  numeric(12,2) not null,   -- what the draft dispute claims
  issued_date     date not null,
  settled         boolean not null default true,
  grouped         boolean not null default true,
  dispute_summary text,
  attempts_used   int  not null default 0,
  status          text not null default 'open'
                  check (status in ('open','supplier_action','submitted','won','denied','written_off')),
  returned_on     date,     -- retailer sent it back for more info
  response_due    date,
  assigned_to     text references app_users(id),
  hero            int,      -- 1,2,3 = demo hero cases
  created_at      timestamptz not null default now()
);

create table evidence (
  id              text primary key,
  deduction_id    text not null references deductions(id) on delete cascade,
  doc_type        text not null
                  check (doc_type in ('pod','bol','delivery_confirmation','claim','asn_file','carton_photo')),
  storage_path    text not null,
  variant         text,
  extracted       jsonb not null default '{}'::jsonb,  -- what the AI "read" from the file
  extraction_note text,
  verified_by     text references app_users(id),       -- set when the analyst confirms the AI read
  verified_at     timestamptz
);

create table dispute_history (
  id               text primary key,
  deduction_id     text not null references deductions(id) on delete cascade,
  attempt_no       int  not null,
  submitted_on     date not null,
  outcome          text not null check (outcome in ('denied','won','returned_for_info')),
  denial_reason    text,
  denial_check_key text  -- which scoring check the denial maps to
);

create table outcomes_archive (   -- closed disputes, for the Insights tab
  id            text primary key,
  retailer_id   text not null references retailers(id),
  raw_code      text not null,
  amount        numeric(12,2) not null,
  outcome       text not null,
  denial_reason text,
  closed_on     date not null
);

create table audit_log (
  id             text primary key default gen_random_uuid()::text,
  deduction_id   text not null references deductions(id) on delete cascade,
  actor          text not null,
  action         text not null,  -- imported | evidence_added | rescored | approved | write_off_requested | write_off_approved | override | requested_document | outcome_recorded
  note           text,
  score_at_action int,
  at             timestamptz not null default now()
);

create index on deductions (retailer_id);
create index on evidence (deduction_id);
create index on dispute_history (deduction_id);
create index on audit_log (deduction_id, at);

-- ---------- Access (demo) ----------
-- Read: anyone with the anon key (fine for fictional demo data).
-- Write: only from server code using the service-role key, which bypasses RLS.
-- Never ship the service-role key to the browser.
do $$
declare t text;
begin
  foreach t in array array['settings','retailers','carriers','app_users','templates','template_lines',
    'code_mappings','purchase_orders','invoices','shipments','asns','deductions','evidence',
    'dispute_history','outcomes_archive','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "demo read" on %I for select using (true)', t);
  end loop;
end $$;
