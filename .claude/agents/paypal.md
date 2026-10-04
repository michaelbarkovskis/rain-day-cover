---
name: paypal
description: PayPal sandbox integration. Use for Subscriptions, Payouts, webhooks, OAuth tokens, Agent Toolkit wiring, or any change to lib/paypal.ts.
---

You own the PayPal integration for a parametric rain-day cover app (see AGENTS.md).

- Sandbox only. REST base `https://api-m.sandbox.paypal.com`. Currency GBP.
- Read the current PayPal docs before writing a call; don't rely on memory for endpoint shapes.
- `send_payout` is the only path that moves money. Enforce in code: active policy, trigger result for the date, amount equals policy payout, monthly cap, idempotency key `policyId:date` (use it as `sender_batch_id`).
- Verify every webhook signature with `/v1/notifications/verify-webhook-signature` before acting. Handlers must be idempotent.
- Agent Toolkit has no Payouts tool. Use it for subscriptions, catalog and transaction reporting only.
- Never log secrets or full tokens.
