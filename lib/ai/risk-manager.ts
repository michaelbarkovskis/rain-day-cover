// AI role 4: risk manager. Reads the pool, writes alerts and recommendations, and proposes per-gauge
// price loadings. Code clamps every loading to LOADING_RANGE; hard capacity limits live in lib/risk.ts.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, logDecision } from "./shared.ts";
import { admin } from "../db.ts";
import { underwriterData } from "../underwriter.ts";
import { clampLoading, LOADING_RANGE, MAX_GAUGE_SHARE, WARN_AT } from "../risk.ts";

export const RISK_MODEL = "claude-sonnet-5-5";

const Review = z.object({
  headline: z.string().describe("one sentence: the single most important thing about the pool right now"),
  alerts: z.array(z.object({
    severity: z.enum(["info", "warn", "critical"]),
    message: z.string().describe("one or two sentences, specific numbers, for an underwriter"),
  })),
  gauges: z.array(z.object({
    ref: z.string().describe("gauge ref exactly as given"),
    loading: z.number().describe(`price multiplier for NEW policies on this gauge, ${LOADING_RANGE[0]} to ${LOADING_RANGE[1]}`),
    reason: z.string().describe("one short line a roofer could read on their quote"),
  })),
  recommendations: z.array(z.string()).describe("up to 3 concrete next steps for the underwriter"),
});
export type RiskReview = z.infer<typeof Review>;

const SYSTEM = `You are the risk manager for a parametric rain-day cover pool for UK roofers (Surrey pilot, PayPal sandbox).
Every policy on the same rain gauge is paid on the same wet day, so concentration per gauge is the pool's main risk.
Hard limits are enforced in code and you cannot change them: one wet day on a gauge may cost at most ${MAX_GAUGE_SHARE * 100}% of capital plus pool,
and the portfolio's worst month must fit within capital plus pool. New quotes are refused beyond those limits.

Your job:
1. Alerts: what an underwriter must know today, with numbers. Critical only for real solvency problems.
2. Loadings: for each gauge, propose a price multiplier for new policies between ${LOADING_RANGE[0]} and ${LOADING_RANGE[1]}.
   Leave 1.0 below ${WARN_AT * 100}% utilisation; rise smoothly towards ${LOADING_RANGE[1]} as utilisation nears 100%, so price slows sign-ups before the hard limit stops them.
   Also consider claims experience: a gauge paying out unusually often may justify a loading even at lower utilisation.
3. Recommendations: up to 3 concrete actions (e.g. market to under-covered areas, seek reinsurance, review a trigger).
Use only the numbers given. Plain, precise English.`;

export async function runRiskReview() {
  const d = await underwriterData();
  const input = {
    pool: { capital: d.kpis.capital, poolBalance: d.kpis.poolBalance, premiumsIn: d.kpis.premiumsIn, payoutsOut: d.kpis.payoutsOut, lossRatio: d.kpis.lossRatio },
    portfolio: { activePolicies: d.kpis.activePolicies, monthlyPremiumIncome: d.kpis.monthlyPremiumIncome, oneWetDay: d.kpis.oneWetDay, worstMonth: d.kpis.worstMonth, paidThisMonth: d.kpis.paidThisMonth },
    perGaugeLimitPerWetDay: d.kpis.gaugeLimit,
    gauges: d.exposure.map((g) => ({ ref: g.ref, label: g.gauge, policies: g.policies, oneWetDay: g.oneWetDay, utilisation: Math.round(g.utilisation * 100) / 100, currentLoading: g.loading })),
    recentClaims: d.claims.slice(0, 30).map((c) => ({ date: c.date, decision: c.decision, reason: c.reason, decidedBy: c.decidedBy, amount: c.amount })),
  };
  const res = await anthropic().messages.parse({
    model: RISK_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Review), effort: "low" },
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  const review = res.parsed_output;
  if (!review) throw new Error(`Risk review returned no parseable output (stop: ${res.stop_reason})`);

  // Code has the last word: only known gauges, only within bounds.
  const known = new Map(d.exposure.map((g) => [g.ref, g.gauge]));
  const applied = review.gauges.filter((g) => known.has(g.ref)).map((g) => ({ gauge_ref: g.ref, gauge_label: known.get(g.ref), price_multiplier: clampLoading(g.loading), reason: g.reason, updated_at: new Date().toISOString() }));
  if (applied.length) {
    const { error } = await admin().from("gauge_risk").upsert(applied);
    if (error) throw new Error(`gauge_risk: ${error.message}`);
  }
  await logDecision("risk_manager", RISK_MODEL, input, { ...review, applied }, review.headline);
  return { ...review, applied };
}
