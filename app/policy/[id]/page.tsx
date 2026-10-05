import Link from "next/link";
import { notFound } from "next/navigation";
import { getPolicy } from "../../actions";
import { userClient } from "@/lib/supabase";
import { activateFromPayPal } from "@/lib/policies";
import type { Trigger } from "@/lib/trigger";
import { AutoRefresh } from "./auto-refresh";

const WET = { 0.2: "any rain or drizzle", 0.5: "steady rain", 1: "heavy rain" } as Record<number, string>;
const STATUS: Record<string, [string, string]> = {
  draft: ["Quote", "Not subscribed yet."],
  pending: ["Waiting for PayPal", "We haven’t heard back from PayPal yet. This page updates once your subscription is confirmed."],
  active: ["Active", ""],
  suspended: ["Paused", "Your last PayPal payment didn’t go through, so cover is paused until it does."],
  cancelled: ["Cancelled", "This cover has ended."],
};
const ordinal = (n: number) => ["1st", "2nd", "3rd"][n - 1] ?? `${n}th`;
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default async function PolicyPage({ params, searchParams }: PageProps<"/policy/[id]">) {
  const { id } = await params;
  const { subscription_id } = await searchParams;
  let policy = await getPolicy(id);
  if (!policy) notFound();

  // Back from PayPal: confirm with PayPal directly, and only for the subscription we created for this policy.
  if (policy.status === "pending" && subscription_id && subscription_id === policy.paypal_subscription_id) {
    await activateFromPayPal(policy.paypal_subscription_id, 4);
    policy = (await getPolicy(id))!;
  }

  const t = policy.trigger_json as Trigger;
  const q = policy.quote_json ?? {};
  const [label, note] = STATUS[policy.status] ?? [policy.status, ""];
  const db = await userClient();
  const [{ data: checks }, { data: claims }] = await Promise.all([
    db.from("weather_checks").select("date, trigger_met, borderline, simulated, raw_data_json").eq("policy_id", id).order("date", { ascending: false }).limit(20),
    db.from("claims").select("date, decision, status, reason, decided_by, payout_amount, ai_explanation").eq("policy_id", id),
  ]);
  const claimOn = new Map((claims ?? []).map((c) => [c.date, c]));
  const paidThisYear = (claims ?? []).filter((c) => c.decision === "pay" && c.status !== "failed").reduce((sum, c) => sum + Number(c.payout_amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-accent">Your cover · {q.district}</p>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className={policy.status === "active" ? "text-accent" : ""}>{label}</span>
        </h1>
        {policy.status === "active" && policy.cover_starts_on && (
          <p className="text-muted">Cover starts {fmt(policy.cover_starts_on)}. From then, any working day with {t.minWetHours}+ hours of {WET[t.wetHourMm]} pays £{policy.payout_amount} to your PayPal{policy.excess_days > 0 ? ` from your ${ordinal(policy.excess_days + 1)} rained-off day each month` : ""}.</p>
        )}
        {note && <p className="text-muted">{note}</p>}
        {policy.status === "pending" && <AutoRefresh seconds={3} />}
      </div>

      <section className="card grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-muted">You pay</p><p className="font-medium">£{Number(policy.monthly_premium).toFixed(2)} a month</p></div>
        <div><p className="text-muted">Each rained-off day</p><p className="font-medium">£{policy.payout_amount}, up to {policy.max_days_per_month} a month</p></div>
        {q.triggerGauge && <div className="col-span-2"><p className="text-muted">Measured by</p><p className="font-medium">Rain gauge {q.triggerGauge.label}, {q.triggerGauge.km}km from you</p></div>}
      </section>

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Your working days</h2>
          {paidThisYear > 0 && <p className="text-sm"><span className="font-semibold text-accent">£{paidThisYear}</span> <span className="text-muted">paid to you so far</span></p>}
        </div>
        {!checks?.length ? (
          <p className="text-sm text-muted">We check every working day once your hours are over. Results show up here.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {checks.map((c) => {
              const claim = claimOn.get(c.date);
              const badge = !claim ? (c.trigger_met ? "Rained off" : "Workable")
                : claim.decision === "pay" ? (claim.status === "paid" ? `£${claim.payout_amount} in your PayPal` : claim.status === "failed" ? "Payment failed, retrying" : `£${claim.payout_amount} on its way`)
                : claim.status === "pending" ? "Being reviewed" : claim.reason === "not_rained_off" ? "Workable" : "Rained off · not paid";
              return (
                <li key={c.date} className="space-y-1 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span>{fmt(c.date)}{c.simulated && <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-xs text-muted">simulated</span>}</span>
                    <span className="text-muted">{c.raw_data_json.wetHours} wet hours · {c.raw_data_json.totalMm}mm</span>
                    <span className={claim?.decision === "pay" ? "font-semibold text-accent" : "text-muted"}>{badge}</span>
                  </div>
                  {claim?.ai_explanation && (
                    <p className="text-muted">{claim.ai_explanation}{claim.decided_by === "ai" && <span className="ml-1 text-xs">(reviewed by our claims assistant)</span>}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-sm"><Link href={`/quote/${id}`} className="text-accent underline">See how your price was worked out</Link></p>
    </div>
  );
}
