-- Campus Order database (Supabase Postgres). Safe to run more than once: `npm run db:setup`.
-- Times are ISO-8601 text in UTC, which sorts and compares correctly as text.

create table if not exists shops (
  id text primary key,
  name text not null,
  is_open boolean not null default true
);

create table if not exists items (
  id text primary key,
  shop_id text not null references shops(id),
  category text not null,
  name text not null,
  portion text,
  available boolean not null default true,
  sort integer not null
);

create table if not exists variants (
  id integer generated always as identity primary key,
  item_id text not null references items(id),
  size text not null,
  price integer not null check (price > 0),
  unique (item_id, size)
);

-- A paid order goes straight to the shop (placed), which marks it ready and hands it over.
create table if not exists orders (
  id text primary key,
  shop_id text not null references shops(id),
  email text not null,
  code text not null,
  status text not null default 'awaiting_payment' check (status in
    ('awaiting_payment', 'placed', 'ready', 'collected', 'rejected', 'cancelled', 'not_collected', 'expired')),
  total integer not null,
  note text not null default '',
  pickup_at text,
  created_at text not null,
  placed_at text,
  ready_at text,
  done_at text,
  reason text
);
-- One active order per student, and pickup codes unique among active orders.
create unique index if not exists one_active_order on orders (email)
  where status in ('awaiting_payment', 'placed', 'ready');
create unique index if not exists unique_active_code on orders (shop_id, code)
  where status in ('awaiting_payment', 'placed', 'ready');
create index if not exists orders_by_status on orders (status);

create table if not exists order_lines (
  order_id text not null references orders(id),
  variant_id integer not null,
  name text not null,
  size text not null,
  price integer not null,
  qty integer not null
);
create index if not exists order_lines_by_order on order_lines (order_id);

create table if not exists payments (
  order_id text primary key references orders(id),
  provider text not null check (provider in ('razorpay', 'mock')),
  gateway_order_id text not null unique,
  payment_id text unique,
  amount_paise integer not null,
  status text not null default 'created' check (status in ('created', 'authorized', 'captured', 'refund_due', 'refunded'))
);

create table if not exists shop_login (
  shop_id text primary key references shops(id),
  salt text not null,
  hash text not null
);

-- The app connects as the database owner, which bypasses row-level security. Turning it on with no
-- policies closes Supabase's public REST API to these tables, so the anon key can't read orders or emails.
alter table shops enable row level security;
alter table items enable row level security;
alter table variants enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table payments enable row level security;
alter table shop_login enable row level security;
