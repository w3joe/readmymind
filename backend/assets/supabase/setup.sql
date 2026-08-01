-- Northwind Desk: schema + seed (run once in Supabase SQL editor)

create extension if not exists "pgcrypto";

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  customer_id uuid not null references customers (id) on delete cascade,
  status text not null check (status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  total_usd numeric(10, 2) not null check (total_usd >= 0),
  shipped_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders (id) on delete cascade,
  amount_usd numeric(10, 2) not null check (amount_usd > 0 and amount_usd <= 50),
  created_at timestamptz not null default now()
);

create table if not exists password_reset_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists orders_customer_id_idx on orders (customer_id);
create index if not exists refunds_order_id_idx on refunds (order_id);
create index if not exists password_reset_events_email_idx on password_reset_events (email);

-- Demo: allow publishable/anon key (no end-user auth in this app)
alter table customers enable row level security;
alter table orders enable row level security;
alter table refunds enable row level security;
alter table password_reset_events enable row level security;

drop policy if exists "anon_all_customers" on customers;
drop policy if exists "anon_all_orders" on orders;
drop policy if exists "anon_all_refunds" on refunds;
drop policy if exists "anon_all_password_reset_events" on password_reset_events;

create policy "anon_all_customers" on customers for all to anon using (true) with check (true);
create policy "anon_all_orders" on orders for all to anon using (true) with check (true);
create policy "anon_all_refunds" on refunds for all to anon using (true) with check (true);
create policy "anon_all_password_reset_events" on password_reset_events for all to anon using (true) with check (true);

grant select, insert, update, delete on customers to anon, authenticated, service_role;
grant select, insert, update, delete on orders to anon, authenticated, service_role;
grant select, insert, update, delete on refunds to anon, authenticated, service_role;
grant select, insert, update, delete on password_reset_events to anon, authenticated, service_role;

insert into customers (id, email, name)
values
  ('11111111-1111-1111-1111-111111111111', 'jordan@northwind.example', 'Jordan Lee'),
  ('22222222-2222-2222-2222-222222222222', 'sam@northwind.example', 'Sam Rivera'),
  ('33333333-3333-3333-3333-333333333333', 'alex@northwind.example', 'Alex Chen')
on conflict (email) do update
set name = excluded.name;

insert into orders (id, customer_id, status, total_usd, shipped_at)
values
  (
    'NW-1001',
    '11111111-1111-1111-1111-111111111111',
    'shipped',
    89.00,
    now() - interval '2 days'
  ),
  (
    'NW-2044',
    '11111111-1111-1111-1111-111111111111',
    'delivered',
    42.50,
    now() - interval '10 days'
  ),
  (
    'NW-0888',
    '22222222-2222-2222-2222-222222222222',
    'processing',
    120.00,
    null
  )
on conflict (id) do update
set
  customer_id = excluded.customer_id,
  status = excluded.status,
  total_usd = excluded.total_usd,
  shipped_at = excluded.shipped_at;
