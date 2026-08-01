-- Northwind Desk seed rows (matches frontend demoprompts)
-- Run after schema.sql

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
