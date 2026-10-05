// Turns a day's trigger check into a claim. Hard rules live here, in code; the AI judge only decides
// whether a borderline day counts as rained off, and it can only pay through settleRainedOffDay().
import { admin } from "./db.ts";
import { sendPayout, MAX_PAYOUT_GBP } from "./paypal.ts";
import { dayRain, liveGaugesNear } from "./live.ts";
import { explainClaim, judgeBorderline } from "./ai/claims-judge.ts";
import type { Trigger, Hour } from "./trigger.ts";
import type { LiveGauge } from "./live.ts";

export type ClaimPolicy = {
  id: string; status: string; cover_starts_on: string | null;
  payout_amount: number; max_days_per_month: number; excess_days: number;
  trigger_json: Trigger; quote_json: { triggerGauge?: LiveGauge | null } | null;
  profiles: { lat: number; lng: number; paypal_email: string };
};
export type DayCheck = {
  date: string; trigger_met: boolean; borderline: boolean; simulated: boolean;
  raw_data_json: { source: string; hours: Hour[]; wetHours: number; totalMm: number; coverage: number | null; note?: string };
};
export type Outcome = { status: "sent" | "declined" | "failed" | "pending"; reason: string; amount: number; paypalBatchId?: string; dayOfMonth?: number; paidThisMonth?: number };

const sameMonth = (date: string) => [`${date.slice(0, 7)}-01`, date] as const;

// Locks the day (one claim per policy per date), applies excess and cap, then pays.
export async function settleRainedOffDay(p: ClaimPolicy, date: string, decidedBy: "code" | "ai", simulated = false): Promise<Outcome> {
  const db = admin();
  const [from] = sameMonth(date);
  const { data: month } = await db.from("claims").select("date, qualifying, decision, status")
    .eq("policy_id", p.id).gte("date", from).lt("date", date);
  const earlier = (month ?? []).filter((c) => c.qualifying).length;
  const paid = (month ?? []).filter((c) => c.decision === "pay" && c.status !== "failed").length;
  const amount = Number(p.payout_amount);

  let reason = "paid";
  if (earlier < p.excess_days) reason = "excess";
  else if (paid >= p.max_days_per_month) reason = "cap";
  else if (!(amount > 0 && amount <= MAX_PAYOUT_GBP)) reason = "review";
  const pay = reason === "paid";

  const { data: claim, error } = await db.from("claims").insert({
    policy_id: p.id, date, qualifying: true, decided_by: decidedBy, reason,
    decision: pay ? "pay" : "decline", payout_amount: pay ? amount : null, status: pay ? "pending" : "declined",
  }).select("id").single();
  if (error) return { status: "declined", reason: "already_settled", amount: 0 }; // unique (policy_id, date): never pay a day twice
  const counts = { dayOfMonth: earlier + 1, paidThisMonth: paid + (pay ? 1 : 0) };
  if (!pay) return { status: "declined", reason, amount: 0, ...counts };

  try {
    // Demo days can be reset and re-run, so they need a fresh batch id; the item id still maps webhooks to this day.
    const key = `${p.id}:${date}`;
    const batch = await sendPayout(p.profiles.paypal_email, amount, simulated ? `${key}:sim${Date.now()}` : key, `Rain-Day Cover: rained off on ${date}`, key);
    await db.from("claims").update({ status: "sent", paypal_payout_id: batch }).eq("id", claim.id);
    return { status: "sent", reason, amount, paypalBatchId: batch, ...counts };
  } catch (e) {
    await db.from("claims").update({ status: "failed" }).eq("id", claim.id);
    console.error("payout failed", p.id, date, e);
    return { status: "failed", reason: "payout_error", amount, ...counts };
  }
}

async function decline(p: ClaimPolicy, date: string, reason: string, decidedBy: "code" | "ai") {
  await admin().from("claims").insert({ policy_id: p.id, date, qualifying: false, decided_by: decidedBy, reason, decision: "decline", status: "declined" });
  return { status: "declined", reason, amount: 0 } satisfies Outcome;
}

export async function processCheck(p: ClaimPolicy, check: DayCheck, opts: { demoSkipWaiting?: boolean } = {}) {
  if (!check.trigger_met && !check.borderline) return null; // a workable day: nothing to claim
  const { data: existing } = await admin().from("claims").select("id").eq("policy_id", p.id).eq("date", check.date).maybeSingle();
  if (existing) return null;

  const waiting = p.cover_starts_on && check.date < p.cover_starts_on && !(check.simulated && opts.demoSkipWaiting); // skip only ever applies to demo days
  const blocked = p.status !== "active" ? "not_active" : waiting ? "waiting_period" : null;
  let outcome: Outcome, explanation: string, decidedBy: "code" | "ai" = "code";
  if (blocked) {
    outcome = await decline(p, check.date, blocked, "code");
  } else if (!check.borderline) {
    outcome = await settleRainedOffDay(p, check.date, "code", check.simulated); // clear trigger: a parametric promise, the AI can't block it
  } else {
    decidedBy = "ai";
    const evidence = await gatherEvidence(p, check);
    const judged = await judgeBorderline(p, check, evidence, {
      pay: () => settleRainedOffDay(p, check.date, "ai", check.simulated),
      decline: () => decline(p, check.date, "not_rained_off", "ai"),
    });
    if (judged.outcome) { outcome = judged.outcome; explanation = judged.explanation; }
    else outcome = { status: "pending", reason: "review", amount: 0 }; // judge didn't decide: no money moves, flagged for a human
  }
  explanation ??= await explainClaim(p, check, outcome);
  await admin().from("claims").update({ ai_explanation: explanation }).eq("policy_id", p.id).eq("date", check.date);
  return { date: check.date, decidedBy, ...outcome, explanation };
}

// Second opinions for the judge: the next live gauge and the Met Office model, same day, same hours.
async function gatherEvidence(p: ClaimPolicy, check: DayCheck) {
  if (check.simulated) return { note: "Demo simulation: only the simulated trigger-gauge readings exist for this day." };
  const t = p.trigger_json, { lat, lng } = p.profiles;
  const window = (hours: Hour[]) => hours.filter((h) => h.time.startsWith(check.date) && +h.time.slice(11, 13) > t.startHour && +h.time.slice(11, 13) <= t.endHour);
  const others = (await liveGaugesNear(lat, lng)).filter((g) => g.ref !== p.quote_json?.triggerGauge?.ref);
  const [second, model] = await Promise.all([
    others[0] ? dayRain({ lat, lng, gauge: others[0] }, check.date, t) : null,
    dayRain({ lat, lng, gauge: null }, check.date, t),
  ]);
  return {
    secondGauge: second && second.source === "gauge" ? { gauge: others[0], hours: window(second.hours) } : null,
    metOfficeModel: { hours: window(model.hours) },
  };
}

// Loads the stored check for a day and settles it. Used by the daily cron and the demo simulator.
export async function processDay(p: ClaimPolicy, date: string, opts: { demoSkipWaiting?: boolean } = {}) {
  const { data } = await admin().from("weather_checks").select("date, trigger_met, borderline, simulated, raw_data_json")
    .eq("policy_id", p.id).eq("date", date).maybeSingle();
  return data ? processCheck(p, data as DayCheck, opts) : null;
}

export const CLAIM_POLICY_COLUMNS = "id, created_at, status, cover_starts_on, payout_amount, max_days_per_month, excess_days, trigger_json, quote_json, profiles(lat, lng, paypal_email)";
