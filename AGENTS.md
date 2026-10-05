<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

Context for any AI agent working in this repo. Full brief: `PROJECT_BRIEF.md`.

## What we're building

Parametric rain-day income cover for UK roofers. Monthly premium via PayPal Subscriptions. When the weather trigger is met on a working day, a payout lands in PayPal the same day. No claim forms. Prototype of the customer and risk layer an MGA would run; not real insurance.

Deadline: submit **11 Nov 2026** (hard cutoff 12 Nov, 8pm UK). Must still work 1 to 15 Dec.

## Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router, TypeScript), Tailwind | One deploy for UI + API routes |
| DB / auth | Supabase (Postgres, magic-link auth) | Free; SQL migrations in `supabase/migrations` |
| Hosting | Vercel | Serverless doesn't sleep; cron built in |
| Scheduler | Vercel Cron → `/api/cron/daily` | Same job keeps Supabase awake through judging |
| Weather | Open-Meteo forecast + archive APIs | Free, no key |
| Geocoding | postcodes.io | Free, no key, UK postcodes |
| AI | Claude via `@anthropic-ai/sdk`. Haiku 4.5 for parsing, Sonnet 5.5 for judge/explanations | Structured outputs + tool use |
| Validation | zod | Every AI output and webhook body is parsed before use |
| Payments | PayPal REST (sandbox): Subscriptions, Payouts, Webhooks; Agent Toolkit for Subscriptions/Catalog/Reporting | |
| Dashboard | AG Grid Community | Sponsor prize. Community only, no Enterprise features |

No other dependencies without a reason written in the PR.

## Layout

```
app/                 pages + app/api/* route handlers
lib/paypal.ts        REST client (token, subscriptions, payouts, webhook verify)
lib/weather.ts       Open-Meteo fetch + cache in weather_checks
lib/trigger.ts       deterministic trigger evaluation (pure, tested)
lib/pricing.ts       historical qualifying-day estimate (pure, tested)
lib/ai/*.ts          one file per AI role, each with its zod schema
supabase/migrations  SQL
```

## The four AI roles (product)

1. **Policy builder** (Haiku): plain English → `Trigger` JSON (variable, threshold, min hours, work window, days). zod-validated, retried once, else ask user.
2. **Pricer/explainer** (Haiku): code computes expected qualifying days from 10 years of archive data; AI only explains the number.
3. **Claims judge** (Sonnet): `lib/trigger.ts` decides clear cases. AI only sees borderline days (within ~10% of threshold) and writes the explanation for every decision. Has one tool: `send_payout`.
4. **Risk manager** (Sonnet): reads exposure by postcode/day, raises alerts, proposes price multipliers within code-enforced bounds. Uses Agent Toolkit reporting tools for pool transactions.

## Hard rules

- **Money moves only through `send_payout` in `lib/paypal.ts`**, which enforces in code: policy active, trigger result exists for that date, amount == policy payout, monthly cap not exceeded, idempotency key = `policyId:date`. The AI cannot override any of these.
- PayPal Agent Toolkit has **no Payouts tool**, so `send_payout` is our own tool exposed to Claude. Say this in the README.
- Every AI call writes a row to `ai_decisions_log` (input, output, reasoning, model).
- Webhooks: verify signature via PayPal's verify endpoint before acting.
- Sandbox only. Secrets in `.env.local`, never committed; `.env.example` lists every key.
- "Simulate weather" injects hourly data into the **same** engine path as real weather. No demo-only shortcuts in the payout path.
- Pure logic (`trigger`, `pricing`, payout limits) gets a small test file. UI doesn't need tests.

## Env vars

```
PAYPAL_CLIENT_ID= PAYPAL_CLIENT_SECRET= PAYPAL_WEBHOOK_ID= PAYPAL_PLAN_ID= PAYPAL_SANDBOX_RECEIVER_EMAIL=
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY= CRON_SECRET=
```

## Decisions so far

- **Pilot market: Surrey roofers.** Engine prices any UK postcode (demo: Manchester costs ~55% more).
- **Price on measured rain:** nearest Environment Agency gauge with 10+ clean years of 2010–2024 (`lib/gauges.ts`). ERA5 overcounted rained-off days 1.5–2x against gauges.
- **Pricing model** (`lib/pricing.ts`): expected payout + 1 standard error (finite history) + 15% of monthly swing (wet runs) + 15% costs. Flat monthly price.
- **Automatic excess:** smallest number of uncovered days per month that keeps price <= 50% of a maximum month. Zero for steady/heavy rain triggers; ~3 days for drizzle-sensitive roofers. We insure abnormal months, not normal weather.
- **Trigger is set by the roofer's words** (policy builder, Sonnet 5.5, chosen by eval). Guildford examples: steady rain 3h ≈ £90/mo; any rain 2h ≈ £113/mo with 3-day excess.
- **No model training.** Prompts + structured output + few-shot examples + a small eval set (`evals/`).
- Personal accounts only for GitHub, Vercel, Supabase. Never the work accounts on this machine.

## Plan

| Week | Dates | Done means |
|---|---|---|
| 1 | 3–11 Oct | ✅ Scaffold, MIT, PayPal go/no-go (sub ACTIVE, payouts SUCCESS), rain analysis. Left: public GitHub repo, Vercel skeleton deploy + webhook test, 6 Oct webinar, message Surrey roofers |
| 2 | 12–18 Oct | Local Supabase, onboarding (postcode → geocode), policy builder + evals, quote screen with AI explanation. **Lock trigger from research by 15 Oct** |
| 3 | 19–25 Oct | Subscribe flow, webhooks update DB, daily cron, simulate-weather panel, home screen |
| 4 | 26 Oct–1 Nov | Claims judge + `send_payout`, claims history, AG Grid underwriter dashboard, risk manager alerts |
| 5 | 2–8 Nov | Design pass, production deploy (personal Supabase + Vercel), keep-alive, README, Devpost text |
| 6 | 9–11 Nov | Video, checklist audit, submit 11 Nov |

Cut order if behind: risk manager → Agent Toolkit reporting → claims history polish. Never cut: subscribe → simulate rain → AI judge → payout lands.

## Subagents (`.claude/agents/`)

| Agent | Owns |
|---|---|
| `paypal` | `lib/paypal.ts`, webhooks, sandbox setup, Agent Toolkit wiring |
| `ai-engineer` | `lib/ai/*`, prompts, zod schemas, decision log |
| `engine` | `lib/weather.ts`, `lib/trigger.ts`, `lib/pricing.ts`, cron, tests |
| `frontend` | pages, tradesperson flow, AG Grid dashboard |
| `submission` | README, Devpost text, video script, checklist audit |
