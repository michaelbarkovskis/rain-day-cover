// AI role 2 (explainer half): code prices the cover; the model only explains the numbers.
import { anthropic, FAST_MODEL } from "./shared.ts";
import type { Quote, Plan } from "../pricing.ts";

const SYSTEM = `You explain a rain-day income cover quote to a self-employed UK roofer.
Write 4 or 5 short sentences of plain English. No markdown, no bullet points, no jargon.
Use only the numbers you are given, each with its own meaning. Never invent, combine or recalculate figures.
Cover, in this order:
1. How often rain like theirs has stopped work, measured at their nearest official rain gauge (name it and its distance).
2. If excess_days is above 0: the first excess_days rained-off days each month aren't paid, because that much rain is normal where they work and they already plan for it; covering it would cost nearly as much as it pays. If excess_days is 0, don't mention an excess.
3. What they pay, what a 1-in-10 wet month would pay them, and how often the cover beat its cost historically.
4. One sentence on the price: mostly expected payouts, plus small buffers for limited history and wet runs, plus running costs.
End with one honest sentence: the gauge isn't on their roof, so a borderline day gets a closer look.`;

export async function explainQuote(input: { district: string; summary: string; quote: Quote; plan: Plan; gauge: { label: string; km: number; years: string; months: number } }) {
  const { quote: q, plan } = input;
  const facts = {
    area: input.district,
    what_counts_as_a_lost_day: input.summary,
    rain_gauge: `Environment Agency gauge at ${input.gauge.label}, ${input.gauge.km}km away`,
    history: `${input.gauge.years}, ${input.gauge.months} complete months of 15-minute readings`,
    lost_days_per_month_on_average: q.avgQualifyingDays,
    lost_days_in_a_typical_month: q.typicalQualifyingDays,
    excess_days: q.excessDays,
    payout_per_day_gbp: plan.payout,
    max_paid_days_per_month: plan.capDays,
    max_paid_out_in_a_month_gbp: plan.capDays * plan.payout,
    average_paid_out_per_month_gbp: Math.round(q.expectedPayout),
    paid_out_in_a_1_in_10_wet_month_gbp: q.oneInTenPayout,
    share_of_months_payout_beat_the_price: `${Math.round(q.aheadShare * 100)}%`,
    monthly_price_gbp: q.monthlyPremium,
    price_breakdown_gbp: q.breakdown,
  };
  const res = await anthropic().messages.create({
    model: FAST_MODEL,
    max_tokens: 500,
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
  return { text, facts };
}
