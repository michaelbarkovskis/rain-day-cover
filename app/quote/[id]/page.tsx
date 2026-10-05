import Link from "next/link";
import { notFound } from "next/navigation";
import { getPolicy, subscribe } from "../../actions";
import { SubmitButton } from "../../submit-button";
import type { Trigger } from "@/lib/trigger";

const MONTHS = "JFMAMJJASOND".split("");
const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WET = { 0.2: "any rain or drizzle", 0.5: "steady rain", 1: "heavy rain" } as Record<number, string>;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default async function QuotePage({ params, searchParams }: PageProps<"/quote/[id]">) {
  const { id } = await params;
  const { cancelled } = await searchParams;
  const policy = await getPolicy(id);
  if (!policy) notFound();
  const t = policy.trigger_json as Trigger;
  const q = policy.quote_json;
  const avgPaid = Math.round(q.expectedPayout ?? q.avgPaidDays * policy.payout_amount);
  const excess = policy.excess_days ?? 0;
  const ordinal = (n: number) => ["1st", "2nd", "3rd"][n - 1] ?? `${n}th`; // n ≤ LOADS.maxExcess + 1

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-accent">Your quote · {q.district}</p>
        <h1 className="text-2xl font-bold tracking-tight">£{Number(policy.monthly_premium).toFixed(2)} a month</h1>
        <p className="text-muted">
          £{policy.payout_amount} paid to your PayPal for each rained-off day{excess > 0 && <> from your <span className="font-medium text-foreground">{ordinal(excess + 1)} each month</span></>}, up to {policy.max_days_per_month} paid days a month.
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">What we understood</h2>
        <p>{q.summary}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted">A day counts when</dt><dd className="font-medium">{t.minWetHours}+ hours of {WET[t.wetHourMm]}</dd></div>
          <div><dt className="text-muted">During</dt><dd className="font-medium">{hh(t.startHour)}–{hh(t.endHour)}, {t.workDays.map((d) => DAY[d]).join(" ")}</dd></div>
          {q.triggerGauge && <div className="col-span-2"><dt className="text-muted">Measured by</dt><dd className="font-medium">Environment Agency rain gauge, {q.triggerGauge.label}, {q.triggerGauge.km}km from you, checked every 15 minutes</dd></div>}
        </dl>
        {q.assumptions?.length > 0 && (
          <div className="rounded-lg bg-background p-3 text-sm">
            <p className="font-medium">We assumed</p>
            <ul className="list-disc pl-5 text-muted">{q.assumptions.map((a: string) => <li key={a}>{a}</li>)}</ul>
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Why this price</h2>
        <p className="leading-relaxed">{q.explanation}</p>
        {q.gauge && (
          <p className="text-sm text-muted">
            Priced on measured rain at the Environment Agency&rsquo;s <span className="font-medium text-foreground">{q.gauge.label}</span> gauge, {q.gauge.km}km away: {q.gauge.months} complete months of 15-minute readings, {q.gauge.years}.
          </p>
        )}
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat value={q.avgQualifyingDays} label="rained-off days a month" />
          {q.oneInTenPayout != null
            ? <Stat value={`£${q.oneInTenPayout}`} label="paid in a 1-in-10 wet month" />
            : <Stat value={`£${avgPaid}`} label="paid out a month on average" />}
          {q.aheadShare != null
            ? <Stat value={`${Math.round(q.aheadShare * 100)}%`} label="of months it paid more than it cost" />
            : <Stat value={`${Math.round(q.maxedOutShare * 100)}%`} label="of months hit the cap" />}
        </div>
        <figure>
          <figcaption className="mb-2 text-sm text-muted">Average paid days by month, {q.gauge ? q.gauge.years : "last 10 years"}</figcaption>
          <div className="flex h-24 items-end gap-1" role="img" aria-label={q.paidDaysByMonth.map((d: number, i: number) => `${MONTHS[i]} ${d}`).join(", ")}>
            {q.paidDaysByMonth.map((d: number, i: number) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-accent/70" style={{ height: `${(d / policy.max_days_per_month) * 80 + 2}px` }} />
                <span className="text-xs text-muted">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </figure>
      </section>

      {q.breakdown && (
        <section className="card space-y-3">
          <h2 className="font-semibold">How your price is built</h2>
          <dl className="space-y-2 text-sm">
            <Line label="Expected payouts" note={`what this cover paid on average, ${q.gauge?.years ?? ""}`} value={q.breakdown.expected} />
            <Line label="History buffer" note={`${q.months} months of records can't show every possible year`} value={q.breakdown.uncertainty} />
            <Line label="Wet-run buffer" note="so the pool can pay everyone in a run of wet months" value={q.breakdown.risk} />
            <Line label="Running costs" note="payments, data and support" value={q.breakdown.expenses} />
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Your monthly price</dt><dd>£{Number(policy.monthly_premium).toFixed(2)}</dd></div>
          </dl>
          {excess > 0 && (
            <p className="rounded-lg bg-background p-3 text-sm text-muted">
              Why the first {excess} {excess === 1 ? "day isn’t" : "days aren’t"} covered: in a typical month here, rain like yours stops work {q.typicalQualifyingDays} days. Covering days you can count on would cost nearly as much as it pays, so this cover is for the months that are wetter than normal.
            </p>
          )}
        </section>
      )}

      <div className="space-y-2">
        {cancelled && <p role="alert" className="text-sm text-danger">You didn&rsquo;t finish subscribing on PayPal. Your quote is still here.</p>}
        {policy.status === "draft" || policy.status === "pending" ? (
          <form action={subscribe.bind(null, policy.id)}>
            <SubmitButton pending="Opening PayPal…">Subscribe with PayPal · £{Number(policy.monthly_premium).toFixed(2)}/month</SubmitButton>
          </form>
        ) : (
          <Link href={`/policy/${policy.id}`} className="btn">View your cover</Link>
        )}
        <p className="text-xs text-muted">Cancel any time in PayPal. Cover starts 7 days after you subscribe.</p>
        <p className="text-sm"><Link href="/describe" className="text-accent underline">Not quite right? Describe it again</Link></p>
      </div>
    </div>
  );
}

function Line({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt><span className="font-medium">{label}</span> <span className="text-muted">· {note}</span></dt>
      <dd className="shrink-0 tabular-nums">£{value.toFixed(2)}</dd>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
