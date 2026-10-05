-- Money through the pool: premiums in (PayPal subscription payments), payouts out (PayPal Payouts).
create table ledger (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('premium', 'payout')),
  policy_id uuid references policies on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  paypal_id text not null unique, -- sale or payout item id; webhook retries can't double-count
  created_at timestamptz not null default now()
);
alter table ledger enable row level security; -- service role only (underwriter dashboard)
