// AI role 2 (explainer half): code prices the cover; the model only explains the numbers.
import { anthropic, FAST_MODEL } from "./shared.ts";
import type { Quote, Plan } from "../pricing.ts";

const SYSTEM = `You explain a rain-day income cover quote to a self-employed UK roofer.
Write 3 or 4 short sentences of plain English. No markdown, no bullet points, no jargon.
Use only the numbers you are given; never invent or recalculate figures.
Cover: how often this cover would have paid out in their area, what they pay and what they get, and why busy months are capped.
End with one honest sentence: the rain data covers their local area, not their exact roof, so a borderline day gets a closer look.`;

export async function explainQuote(input: { district: string; summary: string; quote: Quote; plan: Plan; years: number }) {
  const { quote: q, plan } = input;
  const facts = {
    area: input.district,
    what_counts_as_a_lost_day: input.summary,
    history_years: input.years,
    lost_days_per_month_on_average: q.avgQualifyingDays,
    paid_days_per_month_on_average: q.avgPaidDays,
    payout_per_day_gbp: plan.payout,
    max_paid_days_per_month: plan.capDays,
    share_of_months_hitting_the_cap: `${Math.round(q.maxedOutShare * 100)}%`,
    average_paid_out_per_month_gbp: Math.round(q.avgPaidDays * plan.payout),
    monthly_price_gbp: q.monthlyPremium,
  };
  const res = await anthropic().messages.create({
    model: FAST_MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
  return { text, facts };
}
