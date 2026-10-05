import { ActionForm } from "../action-form";
import { isUnderwriter, unlockUnderwriter, runRiskReviewNow } from "./actions";
import { SubmitButton } from "../submit-button";
import { underwriterData } from "@/lib/underwriter";
import { Grid } from "./grid";

export const metadata = { title: "Underwriter · Rain-Day Cover" };
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Underwriter() {
  if (!(await isUnderwriter())) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Underwriter dashboard</h1>
        <p className="text-muted">For the insurer running the pool. Hackathon judges: the passcode is in the README.</p>
        <div className="card">
          <ActionForm action={unlockUnderwriter} submit="Open dashboard" pending="Checking…">
            <div>
              <label className="label" htmlFor="passcode">Passcode</label>
              <input className="field" id="passcode" name="passcode" type="password" autoComplete="current-password" required />
            </div>
          </ActionForm>
        </div>
      </div>
    );
  }

  const d = await underwriterData();
  const k = d.kpis;
  const capitalAndPool = k.capital + Math.max(k.poolBalance, 0);
  const overCapacity = k.worstMonth > capitalAndPool;
  const review = d.latestReview?.output_json as { headline: string; alerts: { severity: string; message: string }[]; recommendations: string[] } | undefined;
  const tone = { critical: "border-danger/60 text-danger", warn: "border-accent/50", info: "border-border text-muted" } as Record<string, string>;

  return (
    <div className="wide space-y-8">
      <div>
        <p className="text-sm font-medium text-accent">Underwriter · Surrey pilot · PayPal sandbox</p>
        <h1 className="text-2xl font-bold tracking-tight">Pool and exposure</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Pool balance" value={gbp(k.poolBalance)} note={`${gbp(k.premiumsIn)} premiums in, ${gbp(k.payoutsOut)} paid out. Backed by ${gbp(k.capital)} underwriting capital`} />
        <Tile label="Active policies" value={String(k.activePolicies)} note={`${gbp(k.monthlyPremiumIncome)} premium a month`} />
        <Tile label="Paid this month" value={gbp(k.paidThisMonth)} note={`Loss ratio to date ${Math.round(k.lossRatio * 100)}%`} />
        <Tile label="One wet day costs" value={gbp(k.oneWetDay)} note={`Worst month, every policy capped: ${gbp(k.worstMonth)} of ${gbp(capitalAndPool)} capital + pool`} alert={overCapacity} />
      </section>
      {overCapacity && (
        <p role="alert" className="rounded-lg border border-danger/40 p-3 text-sm text-danger">
          A worst-case month would cost more than capital plus pool. New quotes are paused until capacity recovers.
        </p>
      )}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">AI risk manager</h2>
            <p className="text-sm text-muted">{d.latestReview ? `Last review ${new Date(d.latestReview.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Runs daily after the rain checks.` : "No review yet. Runs daily after the rain checks."}</p>
          </div>
          <form action={runRiskReviewNow}><SubmitButton pending="Reviewing the pool…">Run risk review now</SubmitButton></form>
        </div>
        {review && (
          <>
            <p className="font-medium">{review.headline}</p>
            <ul className="space-y-2 text-sm">
              {review.alerts.map((a, i) => <li key={i} className={`rounded-lg border p-3 ${tone[a.severity] ?? ""}`}><span className="mr-2 text-xs font-semibold uppercase">{a.severity}</span>{a.message}</li>)}
            </ul>
            {review.recommendations.length > 0 && (
              <div className="text-sm"><p className="font-medium">Recommended next steps</p><ol className="list-decimal space-y-1 pl-5 text-muted">{review.recommendations.map((r) => <li key={r}>{r}</li>)}</ol></div>
            )}
          </>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Exposure by trigger gauge</h2>
        <p className="text-sm text-muted">Policies on the same gauge are rained off on the same day. Hard limit per gauge: {gbp(k.gaugeLimit)} per wet day (10% of capital + pool); new quotes are refused beyond it. The risk manager&rsquo;s loading slows sign-ups before that.</p>
        {d.exposure.length === 0 ? <p className="text-sm text-muted">No active policies yet.</p> : (
          <ul className="space-y-2 text-sm">
            {d.exposure.map((e) => (
              <li key={e.ref} className="space-y-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{e.gauge}</span>
                  <span className="tabular-nums text-muted">{e.policies} {e.policies === 1 ? "policy" : "policies"} · {gbp(e.oneWetDay)} of {gbp(e.limit)} per wet day · {e.loading > 1 ? `new quotes +${Math.round((e.loading - 1) * 100)}%` : "no loading"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-background">
                  <div className={`h-2 rounded ${e.utilisation >= 1 ? "bg-danger" : e.utilisation >= 0.7 ? "bg-accent" : "bg-accent/50"}`} style={{ width: `${Math.min(e.utilisation, 1) * 100}%` }} />
                </div>
                {e.loadingReason && e.loading > 1 && <p className="text-xs text-muted">{e.loadingReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Section title="Policies" note="Every subscribed policy. Names are first names only; PayPal emails are masked.">
        <Grid kind="policies" rows={d.policies} />
      </Section>
      <Section title="Claims log" note="Every rained-off or borderline working day, who decided it, and what the roofer was told.">
        <Grid kind="claims" rows={d.claims} height={460} />
      </Section>
      <Section title="AI decisions" note="Every call to the policy builder, pricer, claims judge and risk manager, with its reasoning.">
        <Grid kind="decisions" rows={d.decisions} height={460} />
      </Section>
    </div>
  );
}

function Tile({ label, value, note, alert }: { label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className={`card space-y-1 p-4 ${alert ? "border-danger/60" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${alert ? "text-danger" : ""}`}>{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div><h2 className="font-semibold">{title}</h2><p className="text-sm text-muted">{note}</p></div>
      {children}
    </section>
  );
}
