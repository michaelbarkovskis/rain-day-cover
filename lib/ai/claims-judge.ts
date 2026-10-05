// AI role 3: claims judge. Decides borderline days only, and can only pay through the code-guarded tool.
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, FAST_MODEL, logDecision } from "./shared.ts";
import type { ClaimPolicy, DayCheck, Outcome } from "../claims.ts";

export const JUDGE_MODEL = "claude-sonnet-5-5";
const WET = { 0.2: "any rain (0.2mm+ in an hour)", 0.5: "steady rain (0.5mm+ in an hour)", 1: "heavy rain (1mm+ in an hour)" } as Record<number, string>;

const REASONS: Record<string, string> = {
  paid: "paid to their PayPal",
  excess: "counted, but within the monthly excess, so not paid",
  cap: "counted, but this month's paid-day cap was already reached",
  waiting_period: "before their cover started (7-day waiting period)",
  not_active: "their cover isn't active",
  not_rained_off: "the rain didn't meet their trigger",
  payout_error: "approved, but the PayPal payment failed and will be retried",
  already_settled: "this day was already settled",
  review: "held for a human to review",
};

const JUDGE_SYSTEM = `You are the claims judge for parametric rain-day cover for UK roofers.
Code has already measured this working day against the roofer's trigger and found it BORDERLINE:
within one wet hour of the line, or decided from a weather model because their rain gauge was patchy.

Decide whether rain genuinely met their trigger, using all the evidence:
- Pay when the evidence as a whole shows the trigger was met, or missed by a hair: a wet hour just under the threshold,
  rain straddling an hour boundary, a gauge gap during rain, or a second source showing the extra wet hour.
- Decline when the trigger gauge and at least one other source agree the day was clearly short of the trigger.
- If the trigger gauge was offline, trust the second gauge first, then the model.
- When sources mildly disagree, the roofer gets the benefit of the doubt.

Call exactly one tool: pay_rained_off_day or decline_claim. The pay tool enforces the policy's excess,
monthly cap and one-payment-per-day rules itself and tells you what actually happened.
Then write at most 3 short sentences to the roofer: what the rain was, what you decided and why, and what happened
to the money. Plain English, real numbers, no markdown. Never mention tools, code, models or "the system".`;

export async function judgeBorderline(p: ClaimPolicy, check: DayCheck, evidence: unknown, act: { pay: () => Promise<Outcome>; decline: () => Promise<Outcome> }) {
  let outcome: Outcome | null = null;
  const once = async (fn: () => Promise<Outcome>) => {
    if (outcome) return `Already decided: ${outcome.status} (${REASONS[outcome.reason] ?? outcome.reason}).`;
    outcome = await fn();
    return `${outcome.status}: ${REASONS[outcome.reason] ?? outcome.reason}${outcome.amount ? `, £${outcome.amount}` : ""}.`;
  };
  const tools = [
    betaZodTool({
      name: "pay_rained_off_day",
      description: "Record this day as rained off and pay the roofer if the policy's excess and monthly cap allow. Returns what happened.",
      inputSchema: z.object({ reason: z.string().describe("one line: why the evidence shows the trigger was met") }),
      run: () => once(act.pay),
    }),
    betaZodTool({
      name: "decline_claim",
      description: "Record that rain did not meet the trigger on this day. No money moves.",
      inputSchema: z.object({ reason: z.string().describe("one line: why the evidence shows the day was workable") }),
      run: () => once(act.decline),
    }),
  ];

  const t = p.trigger_json;
  const input = {
    date: check.date,
    trigger: `${t.minWetHours}+ hours of ${WET[t.wetHourMm]} between ${t.startHour}:00 and ${t.endHour}:00`,
    code_result: { source: check.raw_data_json.source, wetHours: check.raw_data_json.wetHours, totalMm: check.raw_data_json.totalMm, met: check.trigger_met, gaugeCoverage: check.raw_data_json.coverage, note: check.raw_data_json.note },
    triggerGauge: { gauge: p.quote_json?.triggerGauge ?? null, hourly_mm_hour_ending: check.raw_data_json.hours },
    evidence,
  };
  const final = await anthropic().beta.messages.toolRunner({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    max_iterations: 4,
    system: JUDGE_SYSTEM,
    tools,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  const explanation = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
  const decided = outcome as Outcome | null;
  await logDecision("claims_judge", JUDGE_MODEL, input, { outcome: decided }, explanation, p.id);
  return { outcome: decided, explanation };
}

const EXPLAIN_SYSTEM = `You write a 1-2 sentence note to a UK roofer about one working day on their rain-day cover.
Reword the facts warmly and plainly. Say exactly what "result" says about money; never add numbers, dates or reasons
that aren't in the facts. No markdown, no greeting.`;

const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Code states the exact outcome; the model only phrases it. (Haiku invented cap and date details when left to infer.)
function resultSentence(p: ClaimPolicy, o: Outcome) {
  switch (o.reason) {
    case "paid": return `£${o.amount} paid to their PayPal. That's ${o.paidThisMonth} of up to ${p.max_days_per_month} paid days this month.`;
    case "excess": return `Not paid: this was rained-off day ${o.dayOfMonth} this month, and the first ${p.excess_days} each month are their excess, which this cover doesn't pay.`;
    case "cap": return `Not paid: ${p.max_days_per_month} days have already been paid this month, which is the monthly maximum.`;
    case "waiting_period": return `Not paid: the day was before their cover started on ${longDate(p.cover_starts_on!)}.`;
    case "not_active": return "Not paid: their cover wasn't active that day.";
    case "payout_error": return `Approved for £${o.amount}, but the PayPal payment failed. It will be retried.`;
    default: return REASONS[o.reason] ?? o.reason;
  }
}

export async function explainClaim(p: ClaimPolicy, check: DayCheck, outcome: Outcome) {
  const facts = {
    day: longDate(check.date),
    rain: `${check.raw_data_json.wetHours} wet hours and ${check.raw_data_json.totalMm}mm during their working hours, ${check.raw_data_json.source === "gauge" ? "measured at their rain gauge" : `from the ${check.raw_data_json.source} data`}`,
    their_trigger: `${p.trigger_json.minWetHours}+ hours of ${WET[p.trigger_json.wetHourMm]}`,
    trigger_met: check.trigger_met,
    result: resultSentence(p, outcome),
  };
  const res = await anthropic().messages.create({ model: FAST_MODEL, max_tokens: 200, system: EXPLAIN_SYSTEM, messages: [{ role: "user", content: JSON.stringify(facts) }] });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
}
