import { runDailyChecks } from "@/lib/checks";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not set", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  return Response.json(await runDailyChecks());
}
