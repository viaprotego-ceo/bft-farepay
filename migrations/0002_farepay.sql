-- BFT FarePay — Benton-Franklin PTBA proof-of-payment ledger.
-- Unowned rows (auth off). No PAN, names, or emails. Wallet ids are random UUIDs.

create table if not exists fare_products (
  id text primary key,
  name text not null,
  category text not null,
  service text not null,
  kind text not null,
  price_cents integer not null,
  ride_count integer,
  ride_window_seconds integer not null default 10800,
  pass_seconds integer,
  blurb text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists wallets (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists payment_tokens (
  id text primary key,
  wallet_id text not null,
  processor text not null,
  token_ref text not null,
  brand text not null,
  last4 text not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_tokens_wallet_idx on payment_tokens (wallet_id);

create table if not exists payments (
  id text primary key,
  wallet_id text not null,
  token_id text not null,
  product_id text not null,
  amount_cents integer not null,
  processor_intent text not null,
  status text not null,
  created_at timestamptz not null default now()
);
create index if not exists payments_created_idx on payments (created_at desc);

create table if not exists tickets (
  id text primary key,
  wallet_id text not null,
  product_id text not null,
  payment_id text,
  rides_remaining integer,
  ride_valid_until timestamptz,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists tickets_wallet_idx on tickets (wallet_id, created_at desc);

create table if not exists qr_tokens (
  id text primary key,
  ticket_id text not null,
  nonce text not null,
  payload text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists qr_tokens_issued_idx on qr_tokens (issued_at desc);

create table if not exists inspections (
  id text primary key,
  ticket_id text,
  qr_id text,
  result text not null,
  reason text,
  route_hint text,
  product_name text,
  created_at timestamptz not null default now()
);
create index if not exists inspections_created_idx on inspections (created_at desc);

create table if not exists audit_events (
  id serial primary key,
  kind text not null,
  subject_id text,
  detail text not null default '{}',
  created_at timestamptz not null default now()
);

insert into fare_products (
  id, name, category, service, kind, price_cents, ride_count,
  ride_window_seconds, pass_seconds, blurb, sort_order
) values
  ('adult-single', 'Adult single', 'adult', 'fixed', 'single', 150, 1, 10800, 10800,
   'Fixed route, CONNECT, or Dial-A-Ride within 3/4 mile. Includes one 3-hour transfer.', 10),
  ('adult-10', 'Adult 10-ride', 'adult', 'fixed', 'ten_ride', 1200, 10, 10800, 31536000,
   'Ten paid boardings. Each tap includes a 3-hour transfer window.', 20),
  ('adult-day', 'All-day pass', 'adult', 'fixed', 'day', 400, null, 10800, 72000,
   'Unlimited fixed-route and CONNECT until end of service. $4 adult fare.', 30),
  ('adult-month', 'Adult monthly', 'adult', 'fixed', 'monthly', 2500, null, 10800, 2678400,
   'Unlimited rides for 31 days on fixed route and CONNECT.', 40),
  ('reduced-single', 'Reduced single', 'reduced', 'fixed', 'single', 75, 1, 10800, 10800,
   'Permanent disability documentation required at Three Rivers Transit Center.', 50),
  ('reduced-10', 'Reduced 10-ride', 'reduced', 'fixed', 'ten_ride', 600, 10, 10800, 31536000,
   'Ten reduced boardings. Not valid on Dial-A-Ride.', 60),
  ('reduced-month', 'Reduced monthly', 'reduced', 'fixed', 'monthly', 1250, null, 10800, 2678400,
   '31-day reduced pass. Documentation required in production.', 70),
  ('freedom-single', 'FREEDOM single', 'freedom', 'all', 'single', 300, 1, 10800, 10800,
   'All BFT services, including Dial-A-Ride beyond 3/4 mile of a bus route.', 80),
  ('freedom-10', 'FREEDOM 10-ride', 'freedom', 'all', 'ten_ride', 2500, 10, 10800, 31536000,
   'Ten FREEDOM boardings across every BFT mode.', 90),
  ('freedom-month', 'FREEDOM monthly', 'freedom', 'all', 'monthly', 5000, null, 10800, 2678400,
   'Unlimited all-mode pass, including Dial-A-Ride beyond 3/4 mile.', 100),
  ('youth-pass', 'Youth pass', 'youth', 'all', 'entitlement', 0, null, 10800, 31536000,
   'Ages 0 through 19th birthday. Free on all BFT services. Demo attestation only.', 110),
  ('senior-pass', 'Senior pass', 'senior', 'fixed', 'entitlement', 0, null, 10800, 31536000,
   'Age 65+. Free on fixed route and CONNECT. Senior ID in production.', 120),
  ('veteran-pass', 'Veteran pass', 'veteran', 'fixed', 'entitlement', 0, null, 10800, 31536000,
   'Free on fixed route. Issued at Three Rivers Transit Center or Columbia Basin Veterans Center.', 130)
on conflict (id) do nothing;
