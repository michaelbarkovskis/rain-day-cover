"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSubscription } from "@/lib/paypal";
import { checkPolicyDay, type PolicyForCheck } from "@/lib/checks";
import { processDay, CLAIM_POLICY_COLUMNS, type ClaimPolicy } from "@/lib/claims";
import { simulatedHours } from "@/lib/simulate";
import { capacityFor } from "@/lib/risk";
import { z } from "zod";
import { admin, currentUser, userClient } from "@/lib/supabase";
import { geocode } from "@/lib/weather";
import { pricingHistory } from "@/lib/gauges";
import { liveGaugesNear } from "@/lib/live";
import { evaluateAll } from "@/lib/trigger";
import { price, DEFAULT_PLAN } from "@/lib/pricing";
import { parseWork, toTrigger } from "@/lib/ai/policy-builder";
import { explainQuote } from "@/lib/ai/pricing-explainer";
import { FAST_MODEL, logDecision } from "@/lib/ai/shared";

export type FormState = { error?: string } | undefined;

const Profile = z.object({
  name: z.string().trim().min(1, "Tell us your first name").max(60),
  postcode: z.string().trim().min(5, "Enter your work postcode").max(10),
  paypal_email: z.email("Enter the email you use for PayPal"),
  work_start: z.coerce.number().int().min(4).max(14),
  work_end: z.coerce.number().int().min(10).max(22),
  work_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pick at least one working day"),
});

export async function saveProfile(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Profile.safeParse({ ...Object.fromEntries(form), work_days: form.getAll("work_days") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  if (p.work_end - p.work_start < 4) return { error: "Your working day needs to be at least 4 hours" };

  let place;
  try { place = await geocode(p.postcode); } catch { return { error: "We couldn't find that postcode" }; }

  // No sign-up form: an anonymous session is a real Supabase user, so RLS still applies.
  const supabase = await userClient();
  let user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) return { error: "Couldn't start your session, please try again" };
    user = data.user;
  }

  const { error } = await admin().from("profiles").upsert({
    id: user.id, name: p.name, paypal_email: p.paypal_email, trade: "roofer",
    postcode: p.postcode.toUpperCase(), lat: place.lat, lng: place.lng,
    work_start: `${p.work_start}:00`, work_end: `${p.work_end}:00`, work_days: p.work_days,
  });
  if (error) return { error: "Couldn't save your details, please try again" };
  redirect("/describe");
}

export async function buildPolicy(_: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/start");
  const description = String(form.get("description") ?? "").trim();
  if (description.length < 15) return { error: "Tell us a bit more about when rain stops your work" };
  if (description.length > 1000) return { error: "Please keep it under 1,000 characters" };

  const { data: profile } = await admin().from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/start");

  let parsed;
  try { parsed = await parseWork(description); } catch (e) {
    console.error(e);
    return { error: "Our assistant couldn't read that just now. Please try again." };
  }
  if (!parsed.understood) return { error: "We couldn't tell when rain stops your work. Try describing a typical rainy day." };

  const trigger = toTrigger(parsed, {
    startHour: Number(profile.work_start.slice(0, 2)),
    endHour: Number(profile.work_end.slice(0, 2)),
    workDays: profile.work_days,
  });
  let rain, triggerGauge;
  try {
    // The nearest live gauge decides payouts; pinned now so the roofer knows which one.
    [rain, triggerGauge] = await Promise.all([pricingHistory(profile.lat, profile.lng), liveGaugesNear(profile.lat, profile.lng).then((g) => g[0] ?? null)]);
  } catch (e) {
    console.error(e);
    return { error: "We don't have enough rain gauge history near you yet. We're starting in Surrey." };
  }
  // Risk limits (code): refuse if this gauge or the whole pool is full; otherwise apply the risk manager's bounded loading.
  const capacity = await capacityFor(triggerGauge?.ref ?? null, DEFAULT_PLAN.payout, DEFAULT_PLAN.capDays);
  if (!capacity.ok) return { error: capacity.full === "gauge" ? "We're full near you for now: too many roofers share your rain gauge, and one wet day would pay them all at once. Please try again soon." : "We're not taking new cover right now while our pool catches up. Please try again soon." };
  const q = price(evaluateAll(rain.hours, trigger), DEFAULT_PLAN, capacity.loading);
  if (!q) return { error: "Rain stops work so often where you are that we can't offer cover that's fair value. Try describing heavier rain." };
  const place = await geocode(profile.postcode).catch(() => ({ district: profile.postcode }));
  const gauge = { label: rain.gauge.label, km: rain.gauge.km, years: rain.years, months: rain.months };
  const explanation = await explainQuote({ district: place.district, summary: parsed.summary, quote: q, plan: DEFAULT_PLAN, gauge });

  const { data: policy, error } = await admin().from("policies").insert({
    user_id: user.id, description, trigger_json: trigger,
    payout_amount: DEFAULT_PLAN.payout, max_days_per_month: DEFAULT_PLAN.capDays, excess_days: q.excessDays,
    monthly_premium: q.monthlyPremium, status: "draft",
    quote_json: { ...q, gauge, triggerGauge, risk: { loading: capacity.loading, reason: capacity.loadingReason, utilisation: capacity.utilisation }, district: place.district, summary: parsed.summary, assumptions: parsed.assumptions, explanation: explanation.text },
  }).select("id").single();
  if (error || !policy) return { error: "Couldn't save your quote, please try again" };

  await Promise.all([
    logDecision("policy_builder", FAST_MODEL, { description }, { parsed, trigger }, parsed.assumptions.join("; ") || null, policy.id),
    logDecision("pricer", FAST_MODEL, explanation.facts, { text: explanation.text }, null, policy.id),
  ]);
  redirect(`/quote/${policy.id}`);
}

// RLS: a user can only ever read their own policy.
export async function getPolicy(id: string) {
  const { data } = await (await userClient()).from("policies").select("*").eq("id", id).maybeSingle();
  return data;
}

// Starts a PayPal subscription at this policy's quoted price, then hands the roofer to PayPal to approve.
export async function subscribe(policyId: string) {
  const policy = await getPolicy(policyId); // RLS: only the owner gets a row
  if (!policy) redirect("/start");
  if (policy.status !== "draft" && policy.status !== "pending") redirect(`/policy/${policyId}`);
  if (policy.status === "draft") {
    const capacity = await capacityFor(policy.quote_json?.triggerGauge?.ref ?? null, Number(policy.payout_amount), policy.max_days_per_month);
    if (!capacity.ok) redirect(`/quote/${policyId}?full=1`); // area filled up since the quote
  }
  const origin = (await headers()).get("origin");
  if (!origin) throw new Error("Missing origin header");
  const sub = await createSubscription(process.env.PAYPAL_PLAN_ID!, Number(policy.monthly_premium), `${origin}/policy/${policyId}`, `${origin}/quote/${policyId}?cancelled=1`, policyId);
  const { error } = await admin().from("policies").update({ paypal_subscription_id: sub.id, status: "pending" }).eq("id", policyId);
  if (error) throw new Error(`Couldn't save subscription: ${error.message}`);
  redirect(sub.approveUrl);
}

// ---- Demo controls: inject rain readings through the real check → rules → judge → PayPal payout path ----
const Simulation = z.object({
  date: z.iso.date("Pick a date"),
  pattern: z.enum(["washout", "rainedOff", "borderline", "dry"]),
  skipWaiting: z.literal("on").optional(),
});

async function ownedActivePolicy(policyId: string) {
  const owned = await getPolicy(policyId); // RLS: only the owner gets a row
  if (!owned) return null;
  const { data } = await admin().from("policies").select(CLAIM_POLICY_COLUMNS).eq("id", policyId).single();
  return data as unknown as ClaimPolicy & PolicyForCheck;
}

export async function simulateDay(policyId: string, _: FormState, form: FormData): Promise<FormState> {
  const parsed = Simulation.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { date, pattern, skipWaiting } = parsed.data;
  const p = await ownedActivePolicy(policyId);
  if (!p) redirect("/start");
  if (p.status !== "active") return { error: "Subscribe first: only active cover can be simulated." };

  const db = admin();
  const [{ data: check }, { data: claim }] = await Promise.all([
    db.from("weather_checks").select("simulated").eq("policy_id", policyId).eq("date", date).maybeSingle(),
    db.from("claims").select("id").eq("policy_id", policyId).eq("date", date).maybeSingle(),
  ]);
  if (check && !check.simulated) return { error: "That day already has real gauge readings. Pick another day." };
  if (claim) return { error: "That day is already settled. Reset demo days first, or pick another day." };

  const result = await checkPolicyDay(p, date, simulatedHours(p.trigger_json, date, pattern));
  if (!result) return { error: "That isn't one of your working days." };
  await processDay(p, date, { demoSkipWaiting: !!skipWaiting });
  redirect(`/policy/${policyId}`);
}

export async function resetDemoDays(policyId: string) {
  const p = await ownedActivePolicy(policyId);
  if (!p) redirect("/start");
  const db = admin();
  const { data: sims } = await db.from("weather_checks").select("date").eq("policy_id", policyId).eq("simulated", true);
  const dates = (sims ?? []).map((s) => s.date);
  if (dates.length) {
    await db.from("claims").delete().eq("policy_id", policyId).in("date", dates); // money already sent stays in the ledger
    await db.from("weather_checks").delete().eq("policy_id", policyId).eq("simulated", true);
  }
  redirect(`/policy/${policyId}`);
}
