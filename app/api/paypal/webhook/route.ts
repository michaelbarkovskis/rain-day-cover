import { verifyWebhook } from "@/lib/paypal";

export async function POST(req: Request) {
  const event = await req.json();
  if (!(await verifyWebhook(req.headers, event))) return new Response("bad signature", { status: 400 });
  // TODO week 3: update policies/claims by event_type (BILLING.SUBSCRIPTION.ACTIVATED, PAYMENT.SALE.COMPLETED, PAYMENT.PAYOUTS-ITEM.*)
  console.log("paypal webhook", event.event_type, event.resource?.id);
  return new Response("ok");
}
