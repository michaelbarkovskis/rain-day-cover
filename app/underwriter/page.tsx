import { ActionForm } from "../action-form";
import { isUnderwriter, unlockUnderwriter } from "./actions";
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
  const maxExposure = Math.max(1, ...d.exposure.map((e) => e.oneWetDay));

  return (
    <div className="wide space-y-8">
      <div>
        <p className="text-sm font-medium text-accent">Underwriter · Surrey pilot · PayPal sandbox</p>
        <h1 className="text-2xl font-bold tracking-tight">Pool and exposure</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Pool balance" value={gbp(k.poolBalance)} note={`${gbp(k.premiumsIn)} premiums in, ${gbp(k.payoutsOut)} paid out`} />
        <Tile label="Active policies" value={String(k.activePolicies)} note={`${gbp(k.monthlyPremiumIncome)} premium a month`} />
        <Tile label="Paid this month" value={gbp(k.paidThisMonth)} note={`Loss ratio to date ${Math.round(k.lossRatio * 100)}%`} />
        <Tile label="One wet day costs" value={gbp(k.oneWetDay)} note={`Worst month, every policy capped: ${gbp(k.worstMonth)}`} alert={k.oneWetDay > k.poolBalance} />
      </section>
      {k.oneWetDay > k.poolBalance && (
        <p role="alert" className="rounded-lg border border-danger/40 p-3 text-sm text-danger">
          The pool can&rsquo;t cover a single day of rain across every active policy. All Surrey policies are rained off together, so this is the number to watch.
        </p>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Exposure by trigger gauge</h2>
        <p className="text-sm text-muted">Policies on the same gauge are rained off on the same day. Concentration, not volume, is the pool&rsquo;s risk.</p>
        {d.exposure.length === 0 ? <p className="text-sm text-muted">No active policies yet.</p> : (
          <ul className="space-y-2 text-sm">
            {d.exposure.map((e) => (
              <li key={e.gauge} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3">
                <span className="truncate" title={e.gauge}>{e.gauge}</span>
                <div className="h-2 rounded bg-accent/70" style={{ width: `${(e.oneWetDay / maxExposure) * 100}%` }} />
                <span className="tabular-nums text-muted">{e.policies} {e.policies === 1 ? "policy" : "policies"} · {gbp(e.oneWetDay)} per wet day</span>
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
