import { verifyWebhook } from "@/lib/paypal";
import { activateFromPayPal, recordPremium, setStatusBySubscription, settlePayoutItem } from "@/lib/policies";

// PayPal retries anything that isn't 2xx, so handlers must be idempotent (they are: see lib/policies.ts).
export async function POST(req: Request) {
  const event = await req.json();
  if (!(await verifyWebhook(req.headers, event))) return new Response("bad signature", { status: 400 });
  const r = event.resource ?? {};
  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      await activateFromPayPal(r.id);
      break;
    case "BILLING.SUBSCRIPTION.SUSPENDED":
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      await setStatusBySubscription(r.id, "suspended");
      break;
    case "BILLING.SUBSCRIPTION.CANCELLED":
      await setStatusBySubscription(r.id, "cancelled");
      break;
    case "PAYMENT.SALE.COMPLETED": // a monthly premium landed in the pool
      if (r.billing_agreement_id) await recordPremium(r.billing_agreement_id, r.id, Number(r.amount?.total));
      break;
    case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": // a claim payout landed in the roofer's PayPal
    case "PAYMENT.PAYOUTS-ITEM.FAILED":
    case "PAYMENT.PAYOUTS-ITEM.UNCLAIMED":
      if (r.payout_item?.sender_item_id) await settlePayoutItem(r.payout_item.sender_item_id, r.payout_item_id, Number(r.payout_item.amount?.value), event.event_type.endsWith("SUCCEEDED"));
      break;
  }
  console.log("paypal webhook", event.event_type, r.payout_item_id ?? r.id);
  return new Response("ok");
}
