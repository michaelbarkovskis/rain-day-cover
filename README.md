# Rain-Day Cover

Parametric income cover for self-employed roofers. If the weather stops work, the payout lands in PayPal the same day. No claim forms.

Built for the PayPal AI Hackathon. Sandbox only; a prototype of the customer and risk layer a licensed insurer would run behind.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values
npm run sandbox:check        # proves PayPal Subscriptions + Payouts work
npm run dev
```

Database: apply `supabase/migrations/` to your Supabase project (`supabase link` then `supabase db push`).

_Full README (PayPal APIs used, AI roles, test logins) coming before submission._

## Licence

MIT
