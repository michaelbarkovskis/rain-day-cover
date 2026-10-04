// Week-1 go/no-go: proves Subscriptions and Payouts work in sandbox.
// Run: npm run sandbox:check
import { createPlan, createSubscription, sendPayout, getPayout } from "../lib/paypal.ts";

const receiver = process.env.PAYPAL_SANDBOX_RECEIVER_EMAIL;
if (!receiver) throw new Error("Set PAYPAL_SANDBOX_RECEIVER_EMAIL in .env.local");

let planId = process.env.PAYPAL_PLAN_ID;
if (!planId) {
  planId = await createPlan("Rain-Day Cover (Roofer)", 9.99);
  console.log(`✓ Plan created. Add to .env.local:\n  PAYPAL_PLAN_ID=${planId}`);
} else console.log(`✓ Using plan ${planId}`);

const sub = await createSubscription(planId, 12.5, "https://example.com/ok", "https://example.com/cancel");
console.log(`✓ Subscription ${sub.id} created. Approve it with a sandbox personal account:\n  ${sub.approveUrl}`);

const batchId = await sendPayout(receiver, 60, `sandbox-check:${Date.now()}`, "Test rain-day payout");
console.log(`✓ Payout batch ${batchId} sent to ${receiver}`);
await new Promise((r) => setTimeout(r, 3000));
const payout = await getPayout(batchId);
console.log(`  status: ${payout.batch_header.batch_status}, item: ${payout.items?.[0]?.transaction_status}`);
