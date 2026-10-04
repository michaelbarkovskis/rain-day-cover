-- Rain-Day Cover: initial schema. Server writes with the service role; users only read their own rows.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  email text,
  paypal_email text,
  trade text not null default 'roofer',
  postcode text,
  lat double precision,
  lng double precision,
  work_start time not null default '08:00',
  work_end time not null default '16:00',
  work_days int[] not null default '{1,2,3,4,5}', -- ISO weekday, 1 = Monday
  created_at timestamptz not null default now()
);

create table policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  trigger_json jsonb not null,
  payout_amount numeric(10,2) not null check (payout_amount > 0 and payout_amount <= 100),
  max_days_per_month int not null check (max_days_per_month between 1 and 10),
  excess_days int not null default 0, -- first N qualifying days each month aren't paid
  monthly_premium numeric(10,2) not null,
  status text not null default 'draft' check (status in ('draft','pending','active','suspended','cancelled')),
  paypal_subscription_id text unique,
  cover_starts_on date, -- waiting period stops buying cover when rain is forecast
  created_at timestamptz not null default now()
);

create table weather_checks (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references policies on delete cascade,
  date date not null,
  raw_data_json jsonb not null,
  simulated boolean not null default false,
  trigger_met boolean not null,
  borderline boolean not null default false,
  created_at timestamptz not null default now(),
  unique (policy_id, date)
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references policies on delete cascade,
  date date not null,
  decision text not null check (decision in ('pay','decline')),
  ai_explanation text,
  payout_amount numeric(10,2),
  paypal_payout_id text,
  status text not null default 'pending' check (status in ('pending','sent','failed','declined')),
  created_at timestamptz not null default now(),
  unique (policy_id, date) -- one claim per policy per day, enforced by the DB
);

create table ai_decisions_log (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('policy_builder','pricer','claims_judge','risk_manager')),
  model text not null,
  policy_id uuid references policies on delete set null,
  input_json jsonb not null,
  output_json jsonb,
  reasoning text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table policies enable row level security;
alter table weather_checks enable row level security;
alter table claims enable row level security;
alter table ai_decisions_log enable row level security; -- service role only

create policy "own profile" on profiles for select using (id = auth.uid());
create policy "own policies" on policies for select using (user_id = auth.uid());
create policy "own weather" on weather_checks for select
  using (exists (select 1 from policies p where p.id = policy_id and p.user_id = auth.uid()));
create policy "own claims" on claims for select
  using (exists (select 1 from policies p where p.id = policy_id and p.user_id = auth.uid()));
