// One-off: point PayPal sandbox webhooks at a deployed app. Run: npm run webhook:register -- https://your-app.vercel.app
import { createWebhook } from "../lib/paypal.ts";

const base = process.argv[2];
if (!base?.startsWith("https://")) throw new Error("Pass your deployed https URL");
const id = await createWebhook(`${base.replace(/\/$/, "")}/api/paypal/webhook`);
console.log(`✓ Webhook registered. Set in .env.local and Vercel:\n  PAYPAL_WEBHOOK_ID=${id}`);
