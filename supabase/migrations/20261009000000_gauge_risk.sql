-- Per-gauge price loading proposed by the AI risk manager. Code clamps it to 1.00–1.25 before storing and again before use.
create table gauge_risk (
  gauge_ref text primary key,
  gauge_label text,
  price_multiplier numeric(4,3) not null default 1 check (price_multiplier between 1 and 1.25),
  reason text,
  updated_at timestamptz not null default now()
);
alter table gauge_risk enable row level security; -- service role only
