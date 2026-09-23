-- Mattex Marketplace — persist catalog, supplier metrics, accounts, cart, RFQs.
-- Canonical project: https://pgzdcrlrxukvblydknkn.supabase.co
-- Applied remotely via migrations; this file is the readable schema snapshot.

create table if not exists app_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  payload jsonb not null,
  name text not null default '',
  product_no text not null default '',
  provisional_sku text not null default '',
  category text not null default '',
  supplier text not null default '',
  supplier_slug text not null default '',
  unit text not null default '',
  image_url text not null default '',
  published boolean not null default true,
  held boolean not null default false,
  deleted boolean not null default false,
  discontinued boolean not null default false,
  green boolean not null default false,
  hit boolean not null default false,
  tailor_made boolean not null default false,
  moq text not null default '',
  lead_time jsonb,
  lead_time_label text not null default '',
  size_desc text not null default '',
  created_at_ms bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists suppliers (
  slug text primary key,
  name text not null,
  image_url text not null default '',
  verified boolean not null default true,
  product_count integer not null default 0,
  categories text[] not null default '{}',
  rating numeric not null default 0,
  completion_rate integer not null default 0,
  on_time_rate integer not null default 0,
  search_count integer not null default 0,
  found_count integer not null default 0,
  rfq_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists user_accounts (
  email text primary key,
  kind text not null check (kind in ('buyer', 'staff')),
  name text not null default '',
  phone text not null default '',
  phone_whatsapp boolean not null default false,
  job_title text not null default '',
  company_name text not null default '',
  company_reg text not null default '',
  company_phone text not null default '',
  company_address text not null default '',
  project text not null default '',
  projects jsonb not null default '[]'::jsonb,
  password text not null default '',
  enabled boolean not null default true,
  approval_status text not null default 'approved',
  needs_review boolean not null default false,
  bootstrap boolean not null default false,
  invite_token text,
  invite_expires_at timestamptz,
  invited_at timestamptz,
  created_at timestamptz,
  approved_at timestamptz,
  reviewed_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  url text not null,
  storage_path text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  source text not null default 'catalog',
  created_at timestamptz not null default now()
);

create table if not exists rfqs (
  id text primary key,
  buyer_key text not null default '',
  buyer_email text not null default '',
  buyer_kind text not null default 'member',
  buyer_name text not null default '',
  buyer_phone text not null default '',
  company_name text not null default '',
  review_status text not null default '',
  status text not null default '',
  quote_delivery text not null default '',
  channel text not null default '',
  project text not null default '',
  submitted_at timestamptz,
  quoted_at timestamptz,
  accepted_at timestamptz,
  tms_id text not null default '',
  tms_document_no text not null default '',
  tms_url text not null default '',
  line_count integer not null default 0,
  priced_subtotal numeric,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists rfq_lines (
  id uuid primary key default gen_random_uuid(),
  rfq_id text not null references public.rfqs(id) on delete cascade,
  sort_order integer not null default 0,
  product_id text not null default '',
  product_no text not null default '',
  name text not null default '',
  qty numeric,
  unit text not null default '',
  unit_price numeric,
  quoted_unit_price numeric,
  supplier text not null default '',
  tailor_made boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists supplier_metrics (
  slug text primary key,
  rating numeric not null default 0,
  completion_rate int not null default 0,
  on_time_rate int not null default 0,
  search_count int not null default 0,
  found_count int not null default 0,
  rfq_count int not null default 0,
  empty boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table app_kv enable row level security;
alter table products enable row level security;
alter table suppliers enable row level security;
alter table user_accounts enable row level security;
alter table product_images enable row level security;
alter table rfqs enable row level security;
alter table rfq_lines enable row level security;
alter table supplier_metrics enable row level security;

drop policy if exists "kv_all" on app_kv;
create policy "kv_all" on app_kv for all using (true) with check (true);

drop policy if exists "products_all" on products;
create policy "products_all" on products for all using (true) with check (true);

drop policy if exists suppliers_all on suppliers;
create policy suppliers_all on suppliers for all using (true) with check (true);

drop policy if exists user_accounts_all on user_accounts;
create policy user_accounts_all on user_accounts for all using (true) with check (true);

drop policy if exists product_images_all on product_images;
create policy product_images_all on product_images for all using (true) with check (true);

drop policy if exists rfqs_all on rfqs;
create policy rfqs_all on rfqs for all using (true) with check (true);

drop policy if exists rfq_lines_all on rfq_lines;
create policy rfq_lines_all on rfq_lines for all using (true) with check (true);

drop policy if exists "metrics_all" on supplier_metrics;
create policy "metrics_all" on supplier_metrics for all using (true) with check (true);
