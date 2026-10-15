-- RFQ and PO records for the backend-only store (server/rfq-supabase.js).
-- Separate from the old public.rfqs / public.rfq_lines tables, which are left untouched.
-- Only the server (service role) reads or writes these. Browsers get no access at all.

create table if not exists public.doc_counters (
  key text primary key,
  value bigint not null default 0
);

create table if not exists public.rfq_records (
  id text primary key,
  revision integer not null check (revision >= 1),
  buyer_email text not null default '',
  review_status text not null default '',
  visitor text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  record jsonb not null
);

create table if not exists public.po_records (
  id text primary key,
  revision integer not null check (revision >= 1),
  buyer_email text not null default '',
  rfq_id text not null default '',
  visitor text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  record jsonb not null
);

create index if not exists rfq_records_buyer_idx on public.rfq_records (buyer_email, created_at desc);
create index if not exists rfq_records_created_idx on public.rfq_records (created_at desc);
create index if not exists rfq_records_snapshots_idx on public.rfq_records using gin ((record -> 'quoteSnapshots'));
create index if not exists po_records_buyer_idx on public.po_records (buyer_email, created_at desc);
create index if not exists po_records_created_idx on public.po_records (created_at desc);
create index if not exists po_records_visitor_idx on public.po_records (visitor, created_at desc);

alter table public.doc_counters enable row level security;
alter table public.rfq_records enable row level security;
alter table public.po_records enable row level security;
-- No policies on purpose: with RLS on and no policy, anon and authenticated see nothing.

revoke all on table public.doc_counters, public.rfq_records, public.po_records from public, anon, authenticated;

-- One call takes the next number and inserts the row, so two requests can never share a number.
create or replace function public.create_doc(p_kind text, p_at timestamptz, p_by text, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_yy text;
  v_n bigint;
  v_id text;
  v_stamp text;
  v_rec jsonb;
begin
  if p_kind = 'rfq' then v_prefix := 'RFQ';
  elsif p_kind = 'po' then v_prefix := 'PO';
  else raise exception 'kind';
  end if;

  v_yy := to_char(p_at at time zone 'UTC', 'YY');
  v_stamp := to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  insert into public.doc_counters as c (key, value)
  values (v_prefix || '-' || v_yy, 1)
  on conflict (key) do update set value = c.value + 1
  returning c.value into v_n;

  v_id := v_prefix || '-' || v_yy || lpad(v_n::text, 6, '0');
  v_rec := coalesce(p_input, '{}'::jsonb) || jsonb_build_object(
    'id', v_id, 'revision', 1, 'createdAt', v_stamp, 'updatedAt', v_stamp, 'createdBy', coalesce(p_by, 'guest')
  );

  if p_kind = 'rfq' then
    insert into public.rfq_records (id, revision, buyer_email, review_status, visitor, created_at, updated_at, record)
    values (
      v_id, 1,
      lower(btrim(coalesce(v_rec ->> 'buyerEmail', ''))),
      coalesce(v_rec ->> 'reviewStatus', ''),
      coalesce(v_rec ->> 'visitor', ''),
      p_at, p_at, v_rec
    );
  else
    insert into public.po_records (id, revision, buyer_email, rfq_id, visitor, created_at, updated_at, record)
    values (
      v_id, 1,
      lower(btrim(coalesce(v_rec ->> 'buyerEmail', ''))),
      coalesce(v_rec ->> 'rfqId', ''),
      coalesce(v_rec ->> 'visitor', ''),
      p_at, p_at, v_rec
    );
  end if;
  return v_rec;
end;
$$;

-- Writes only if the revision the caller read is still the stored one. Returns null on a stale write.
create or replace function public.update_doc(p_kind text, p_id text, p_expected integer, p_at timestamptz, p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer := p_expected + 1;
  v_stamp text := to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_rec jsonb;
  v_out jsonb;
begin
  v_rec := p_record || jsonb_build_object('id', p_id, 'revision', v_next, 'updatedAt', v_stamp);
  if p_kind = 'rfq' then
    update public.rfq_records
       set revision = v_next,
           buyer_email = lower(btrim(coalesce(v_rec ->> 'buyerEmail', ''))),
           review_status = coalesce(v_rec ->> 'reviewStatus', ''),
           visitor = coalesce(v_rec ->> 'visitor', ''),
           updated_at = p_at,
           record = v_rec
     where id = p_id and revision = p_expected
    returning record into v_out;
  elsif p_kind = 'po' then
    update public.po_records
       set revision = v_next,
           buyer_email = lower(btrim(coalesce(v_rec ->> 'buyerEmail', ''))),
           rfq_id = coalesce(v_rec ->> 'rfqId', ''),
           visitor = coalesce(v_rec ->> 'visitor', ''),
           updated_at = p_at,
           record = v_rec
     where id = p_id and revision = p_expected
    returning record into v_out;
  else
    raise exception 'kind';
  end if;
  return v_out;
end;
$$;

-- The RFQ behind a frozen public quote link (the token is the only thing the caller knows).
create or replace function public.find_rfq_by_snapshot(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select record from public.rfq_records where (record -> 'quoteSnapshots') ? p_token limit 1;
$$;

revoke all on function public.create_doc(text, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_doc(text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.find_rfq_by_snapshot(text) from public, anon, authenticated;
grant execute on function public.create_doc(text, timestamptz, text, jsonb) to service_role;
grant execute on function public.update_doc(text, text, integer, timestamptz, jsonb) to service_role;
grant execute on function public.find_rfq_by_snapshot(text) to service_role;
grant select, insert, update on public.doc_counters, public.rfq_records, public.po_records to service_role;
