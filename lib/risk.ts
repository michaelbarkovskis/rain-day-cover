// Capacity limits for the pool. Hard rules in code; the AI risk manager only sets loadings within LOADING_RANGE.
import { admin } from "./db.ts";

// ponytail: fixed sandbox capital; a real MGA gets this figure from its insurer or reinsurer.
export const CAPITAL_GBP = 5000;
export const MAX_GAUGE_SHARE = 0.1;           // one wet day on one gauge may cost at most 10% of capital + pool
export const WARN_AT = 0.7;                   // utilisation where the risk manager should start loading prices
export const LOADING_RANGE = [1, 1.25] as const;

export const clampLoading = (m: number) => Math.min(Math.max(Number.isFinite(m) ? m : 1, LOADING_RANGE[0]), LOADING_RANGE[1]);
export const gaugeLimit = (pool: number) => MAX_GAUGE_SHARE * (CAPITAL_GBP + Math.max(pool, 0));
export const MODEL_ONLY = "model"; // policies with no live gauge pinned share one bucket

export async function poolBalance() {
  const { data } = await admin().from("ledger").select("kind, amount");
  return (data ?? []).reduce((s, l) => s + (l.kind === "premium" ? 1 : -1) * Number(l.amount), 0);
}

// Can we take one more policy on this gauge, and at what loading? Pending policies count: they're about to be live.
export async function capacityFor(gaugeRef: string | null, payout: number, capDays: number) {
  const db = admin(), ref = gaugeRef ?? MODEL_ONLY;
  const [{ data: live }, pool, { data: risk }] = await Promise.all([
    db.from("policies").select("payout_amount, max_days_per_month, quote_json").in("status", ["active", "pending"]),
    poolBalance(),
    db.from("gauge_risk").select("price_multiplier, reason").eq("gauge_ref", ref).maybeSingle(),
  ]);
  const onGauge = (live ?? []).filter((p) => (p.quote_json?.triggerGauge?.ref ?? MODEL_ONLY) === ref);
  const gaugeDay = onGauge.reduce((s, p) => s + Number(p.payout_amount), 0) + payout;
  const worstMonth = (live ?? []).reduce((s, p) => s + Number(p.payout_amount) * p.max_days_per_month, 0) + payout * capDays;
  const limit = gaugeLimit(pool), capital = CAPITAL_GBP + Math.max(pool, 0);
  const full = gaugeDay > limit ? "gauge" : worstMonth > capital ? "portfolio" : null;
  return {
    ok: !full, full,
    utilisation: gaugeDay / limit,
    loading: clampLoading(Number(risk?.price_multiplier ?? 1)),
    loadingReason: risk?.reason ?? null,
  };
}
