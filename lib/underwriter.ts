// Everything the underwriter dashboard (and the AI risk manager) needs, computed server-side. Service role only.
import { admin } from "./db.ts";
import type { Trigger } from "./trigger.ts";
import { gaugeLimit, clampLoading, MODEL_ONLY, CAPITAL_GBP } from "./risk.ts";

const WET = { 0.2: "any rain", 0.5: "steady rain", 1: "heavy rain" } as Record<number, string>;
const mask = (email: string | null) => (email ? email.replace(/^(.)[^@]*(@.*)$/, "$1***$2") : "");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export async function underwriterData(now = new Date()) {
  const db = admin();
  const [policies, claims, ledger, decisions, gaugeRisk] = await Promise.all([
    db.from("policies").select("id, status, monthly_premium, payout_amount, max_days_per_month, excess_days, trigger_json, quote_json, cover_starts_on, created_at, profiles(name, postcode, paypal_email)").neq("status", "draft").order("created_at", { ascending: false }),
    db.from("claims").select("policy_id, date, decision, status, reason, decided_by, payout_amount, ai_explanation, created_at").order("date", { ascending: false }).limit(500),
    db.from("ledger").select("kind, amount, created_at"),
    db.from("ai_decisions_log").select("type, model, reasoning, policy_id, created_at, output_json").order("created_at", { ascending: false }).limit(200),
    db.from("gauge_risk").select("gauge_ref, price_multiplier, reason"),
  ]);
  for (const r of [policies, claims, ledger, decisions]) if (r.error) throw new Error(r.error.message);

  type P = { id: string; status: string; monthly_premium: number; payout_amount: number; max_days_per_month: number; excess_days: number; trigger_json: Trigger; quote_json: { district?: string; triggerGauge?: { ref: string; label: string } } | null; cover_starts_on: string | null; created_at: string; profiles: { name: string; postcode: string; paypal_email: string } };
  const ps = (policies.data ?? []) as unknown as P[];
  const active = ps.filter((p) => p.status === "active");
  const name = new Map(ps.map((p) => [p.id, p.profiles?.name ?? "?"]));
  const paidByPolicy = new Map<string, number>();
  for (const c of claims.data ?? []) if (c.decision === "pay" && c.status !== "failed") paidByPolicy.set(c.policy_id, (paidByPolicy.get(c.policy_id) ?? 0) + Number(c.payout_amount));

  const premiumsIn = sum((ledger.data ?? []).filter((l) => l.kind === "premium").map((l) => Number(l.amount)));
  const payoutsOut = sum((ledger.data ?? []).filter((l) => l.kind === "payout").map((l) => Number(l.amount)));
  const month = now.toISOString().slice(0, 7);
  const paidThisMonth = (claims.data ?? []).filter((c) => c.date.startsWith(month) && c.decision === "pay" && c.status !== "failed");

  // Every policy on a gauge pays on the same wet day: that correlation is the pool's real risk.
  const limit = gaugeLimit(premiumsIn - payoutsOut);
  const loadings = new Map((gaugeRisk.data ?? []).map((r) => [r.gauge_ref, { loading: clampLoading(Number(r.price_multiplier)), reason: r.reason as string | null }]));
  const byGauge = new Map<string, { ref: string; gauge: string; policies: number; oneWetDay: number; premiums: number; limit: number; utilisation: number; loading: number; loadingReason: string | null }>();
  for (const p of active) {
    const ref = p.quote_json?.triggerGauge?.ref ?? MODEL_ONLY;
    const g = byGauge.get(ref) ?? { ref, gauge: p.quote_json?.triggerGauge?.label ?? "Model only (no live gauge)", policies: 0, oneWetDay: 0, premiums: 0, limit, utilisation: 0, loading: loadings.get(ref)?.loading ?? 1, loadingReason: loadings.get(ref)?.reason ?? null };
    g.policies++; g.oneWetDay += Number(p.payout_amount); g.premiums += Number(p.monthly_premium); g.utilisation = g.oneWetDay / limit;
    byGauge.set(ref, g);
  }

  return {
    kpis: {
      capital: CAPITAL_GBP, gaugeLimit: limit,
      poolBalance: premiumsIn - payoutsOut,
      premiumsIn, payoutsOut,
      lossRatio: premiumsIn ? payoutsOut / premiumsIn : 0,
      activePolicies: active.length,
      monthlyPremiumIncome: sum(active.map((p) => Number(p.monthly_premium))),
      paidThisMonth: sum(paidThisMonth.map((c) => Number(c.payout_amount))),
      oneWetDay: sum(active.map((p) => Number(p.payout_amount))),              // all active policies rained off on the same day
      worstMonth: sum(active.map((p) => Number(p.payout_amount) * p.max_days_per_month)), // every policy hits its cap
    },
    exposure: [...byGauge.values()].sort((a, b) => b.oneWetDay - a.oneWetDay),
    policies: ps.map((p) => ({
      name: p.profiles?.name, postcode: p.profiles?.postcode, payTo: mask(p.profiles?.paypal_email),
      status: p.status, gauge: p.quote_json?.triggerGauge?.label ?? "", district: p.quote_json?.district ?? "",
      trigger: `${p.trigger_json.minWetHours}h+ ${WET[p.trigger_json.wetHourMm] ?? ""}`,
      premium: Number(p.monthly_premium), payout: Number(p.payout_amount), cap: p.max_days_per_month, excess: p.excess_days,
      coverStarts: p.cover_starts_on, paidSoFar: paidByPolicy.get(p.id) ?? 0,
    })),
    claims: (claims.data ?? []).map((c) => ({
      date: c.date, name: name.get(c.policy_id) ?? "?", decision: c.decision, status: c.status, reason: c.reason,
      decidedBy: c.decided_by, amount: c.payout_amount ? Number(c.payout_amount) : 0, explanation: c.ai_explanation ?? "",
    })),
    latestReview: (decisions.data ?? []).find((d) => d.type === "risk_manager") ?? null,
    decisions: (decisions.data ?? []).map((d) => ({
      when: d.created_at, type: d.type, model: d.model, name: d.policy_id ? name.get(d.policy_id) ?? "" : "", reasoning: d.reasoning ?? "",
    })),
  };
}
export type UnderwriterData = Awaited<ReturnType<typeof underwriterData>>;
