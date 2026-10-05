// Policy lifecycle driven by PayPal subscription state. Every function is safe to call twice:
// the return page and the webhook both activate, whichever arrives first wins.
import { admin } from "./db.ts";
import { getSubscription } from "./paypal.ts";
import { londonDate } from "./checks.ts";

export const WAITING_DAYS = 7; // stops people buying cover the morning heavy rain is forecast

// PayPal redirects the buyer back a moment before it flips the subscription to ACTIVE, so the return page retries.
export async function activateFromPayPal(subscriptionId: string, attempts = 1) {
  let sub = await getSubscription(subscriptionId); // trust PayPal's state, not the browser's query string
  for (let i = 1; i < attempts && sub.status === "APPROVAL_PENDING"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    sub = await getSubscription(subscriptionId);
  }
  if (!["ACTIVE", "APPROVED"].includes(sub.status)) return { activated: false, paypalStatus: sub.status as string };
  const cover_starts_on = londonDate(new Date(Date.now() + WAITING_DAYS * 86400e3));
  const { data } = await admin().from("policies")
    .update({ status: "active", cover_starts_on })
    .eq("paypal_subscription_id", subscriptionId).in("status", ["draft", "pending"])
    .select("id").maybeSingle();
  return { activated: !!data, paypalStatus: sub.status as string };
}

export async function setStatusBySubscription(subscriptionId: string, status: "suspended" | "cancelled") {
  await admin().from("policies").update({ status }).eq("paypal_subscription_id", subscriptionId).neq("status", "cancelled");
}

export async function recordPremium(subscriptionId: string, saleId: string, amount: number) {
  const db = admin();
  const { data: policy } = await db.from("policies").select("id").eq("paypal_subscription_id", subscriptionId).maybeSingle();
  const { error } = await db.from("ledger").upsert(
    { kind: "premium", policy_id: policy?.id ?? null, amount, paypal_id: saleId },
    { onConflict: "paypal_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`ledger: ${error.message}`);
}

// Payout webhooks: sender_item_id is "<policyId>:<date>", set when the claim paid out.
export async function settlePayoutItem(senderItemId: string, payoutItemId: string, amount: number, ok: boolean) {
  const [policyId, date] = senderItemId.split(":");
  if (!/^[0-9a-f-]{36}$/.test(policyId) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return; // e.g. our sandbox test payouts
  const db = admin();
  await db.from("claims").update({ status: ok ? "paid" : "failed" }).eq("policy_id", policyId).eq("date", date);
  if (ok) await db.from("ledger").upsert({ kind: "payout", policy_id: policyId, amount, paypal_id: payoutItemId }, { onConflict: "paypal_id", ignoreDuplicates: true });
}
