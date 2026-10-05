// PayPal REST (sandbox). The only module that talks to PayPal's money APIs.
const BASE = "https://api-m.sandbox.paypal.com";
const CURRENCY = "GBP";
// Absolute ceiling regardless of policy. Per-policy checks (active, trigger met, monthly cap) live in the claims flow.
export const MAX_PAYOUT_GBP = 100;

let cached: { token: string; expires: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cached = { token: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 };
  return cached.token;
}

async function call(method: string, path: string, body?: unknown, requestId?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(requestId && { "PayPal-Request-Id": requestId }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`PayPal ${method} ${path} → ${res.status}: ${text}`);
  return json;
}

const money = (n: number) => ({ value: n.toFixed(2), currency_code: CURRENCY });

export async function createPlan(name: string, monthlyGBP: number): Promise<string> {
  const product = await call("POST", "/v1/catalogs/products", { name, type: "SERVICE" });
  const plan = await call("POST", "/v1/billing/plans", {
    product_id: product.id,
    name,
    billing_cycles: [{
      frequency: { interval_unit: "MONTH", interval_count: 1 },
      tenure_type: "REGULAR",
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: money(monthlyGBP) },
    }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
  });
  return plan.id;
}

// Per-user price: plan has a fixed price; override it on the subscription.
// customId = our policy id, echoed back on every subscription webhook.
export async function createSubscription(planId: string, monthlyGBP: number, returnUrl: string, cancelUrl: string, customId?: string) {
  const sub = await call("POST", "/v1/billing/subscriptions", {
    plan_id: planId,
    custom_id: customId,
    plan: { billing_cycles: [{ sequence: 1, pricing_scheme: { fixed_price: money(monthlyGBP) } }] },
    application_context: { brand_name: "Rain-Day Cover", user_action: "SUBSCRIBE_NOW", return_url: returnUrl, cancel_url: cancelUrl },
  });
  const approveUrl: string = sub.links.find((l: { rel: string }) => l.rel === "approve").href;
  return { id: sub.id as string, approveUrl };
}

export const getSubscription = (id: string) => call("GET", `/v1/billing/subscriptions/${id}`);

// idempotencyKey = `${policyId}:${date}`. PayPal rejects a repeated sender_batch_id, so a retry can't double-pay.
// itemId (what payout webhooks echo back) defaults to the same key; demo re-runs pass a fresh batch key, same itemId.
export async function sendPayout(receiverEmail: string, amountGBP: number, idempotencyKey: string, note: string, itemId = idempotencyKey) {
  if (!(amountGBP > 0 && amountGBP <= MAX_PAYOUT_GBP)) throw new Error(`Payout £${amountGBP} outside hard limit`);
  const batch = await call("POST", "/v1/payments/payouts", {
    sender_batch_header: { sender_batch_id: idempotencyKey, email_subject: "Your rain-day payout", email_message: note },
    items: [{ recipient_type: "EMAIL", receiver: receiverEmail, amount: { value: amountGBP.toFixed(2), currency: CURRENCY }, note, sender_item_id: itemId }],
  }, idempotencyKey);
  return batch.batch_header.payout_batch_id as string;
}

export const getPayout = (batchId: string) => call("GET", `/v1/payments/payouts/${batchId}`);

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const res = await call("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  });
  return res.verification_status === "SUCCESS";
}

export const WEBHOOK_EVENTS = [
  "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
];

export async function createWebhook(url: string): Promise<string> {
  const hook = await call("POST", "/v1/notifications/webhooks", { url, event_types: WEBHOOK_EVENTS.map((name) => ({ name })) });
  return hook.id;
}
