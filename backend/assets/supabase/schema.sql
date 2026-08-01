-- Northwind Desk schema for ReadMyMind agent demo
-- Run in Supabase SQL editor before seed.sql

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
