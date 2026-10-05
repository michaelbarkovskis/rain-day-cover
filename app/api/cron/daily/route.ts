import { runDailyChecks } from "@/lib/checks";
import { runRiskReview } from "@/lib/ai/risk-manager";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not set", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const checks = await runDailyChecks();
  // After the day's claims, so the review sees them. A failed review must not hide the checks result.
  const risk = await runRiskReview().then((r) => ({ headline: r.headline, applied: r.applied.length }), (e: Error) => ({ error: e.message }));
  return Response.json({ ...checks, risk });
}
