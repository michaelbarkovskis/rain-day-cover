// Daily trigger check: one weather_checks row per policy per working day. Feeds the claims judge and payouts.
import { admin } from "./db.ts";
import { dayRain, type DayRain, type LiveGauge } from "./live.ts";
import { evaluateDay, isoWeekday, type Hour, type Trigger } from "./trigger.ts";

const READY_AFTER_MIN = 45; // gauge readings lag; wait this long after the work window ends
const CATCH_UP_DAYS = 3;    // re-check recent days a missed cron run skipped

export type PolicyForCheck = {
  id: string;
  created_at: string;
  cover_starts_on: string | null;
  trigger_json: Trigger;
  quote_json: { triggerGauge?: LiveGauge | null } | null;
  profiles: { lat: number; lng: number };
};

const londonParts = (d: Date) => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((p) => [p.type, p.value]),
);
export const londonDate = (d: Date) => { const p = londonParts(d); return `${p.year}-${p.month}-${p.day}`; };

// Working days whose window has finished and that aren't checked yet.
export async function dueDates(policy: PolicyForCheck, now = new Date()) {
  const t = policy.trigger_json, starts = policy.cover_starts_on ?? policy.created_at.slice(0, 10);
  const p = londonParts(now), minutesNow = Number(p.hour) * 60 + Number(p.minute);
  const candidates = Array.from({ length: CATCH_UP_DAYS + 1 }, (_, i) => londonDate(new Date(now.getTime() - i * 86400e3)))
    .filter((d, i) => d >= starts && t.workDays.includes(isoWeekday(d)) && (i > 0 || minutesNow >= t.endHour * 60 + READY_AFTER_MIN));
  if (!candidates.length) return [];
  const { data } = await admin().from("weather_checks").select("date").eq("policy_id", policy.id).in("date", candidates);
  const done = new Set((data ?? []).map((r) => r.date));
  return candidates.filter((d) => !done.has(d));
}

export async function checkPolicyDay(policy: PolicyForCheck, date: string, simulated?: Hour[]) {
  const t = policy.trigger_json;
  const rain: DayRain | { source: "simulated"; gauge: null; coverage: null; hours: Hour[] } = simulated
    ? { source: "simulated", gauge: null, coverage: null, hours: simulated }
    : await dayRain({ lat: policy.profiles.lat, lng: policy.profiles.lng, gauge: policy.quote_json?.triggerGauge ?? null }, date, t);
  const r = evaluateDay(date, rain.hours, t);
  if (!r) return null; // not one of their working days
  const window = rain.hours.filter((h) => h.time.startsWith(date) && +h.time.slice(11, 13) > t.startHour && +h.time.slice(11, 13) <= t.endHour);
  // A model-decided payout gets a second look from the claims judge: models miss and invent rain.
  const borderline = r.borderline || (rain.source === "model" && r.met);
  const { error } = await admin().from("weather_checks").upsert({
    policy_id: policy.id, date, simulated: !!simulated, trigger_met: r.met, borderline,
    raw_data_json: { ...rain, hours: window, wetHours: r.wetHours, totalMm: r.totalMm },
  }, { onConflict: "policy_id,date", ignoreDuplicates: !simulated });
  if (error) throw new Error(`weather_checks: ${error.message}`);
  return { date, source: rain.source, met: r.met, borderline, wetHours: r.wetHours, totalMm: r.totalMm };
}

export async function runDailyChecks(now = new Date()) {
  const { data: policies, error } = await admin().from("policies")
    .select("id, created_at, cover_starts_on, trigger_json, quote_json, profiles(lat, lng)").eq("status", "active");
  if (error) throw new Error(error.message);
  const results = [];
  for (const p of (policies ?? []) as unknown as PolicyForCheck[]) {
    for (const date of await dueDates(p, now)) {
      try { results.push({ policy: p.id, ...(await checkPolicyDay(p, date)) }); }
      catch (e) { results.push({ policy: p.id, date, error: (e as Error).message }); } // one bad policy mustn't stop the rest
    }
  }
  return { checked: results.length, results };
}
