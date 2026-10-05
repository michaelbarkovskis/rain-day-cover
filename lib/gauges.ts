// Pricing history from Environment Agency rain gauges (free, no key): measured rain, 15-minute readings.
// Cached per gauge-day in Postgres so a quote doesn't refetch 15 years of readings.
import { admin } from "./db.ts";
import type { Hour } from "./trigger.ts";

const EA = "https://environment.data.gov.uk/hydrology";
export const PRICING_YEARS = { from: 2010, to: 2024 }; // 15 complete years
const MIN_READINGS = 86;          // of 96 a day: a day with >10% gaps doesn't count either way
const MIN_MONTH_COVERAGE = 0.9;   // months with more missing days are dropped, not counted as dry
const MIN_USABLE_MONTHS = 120;    // need 10+ clean years of the 15 to price on a gauge

export type Gauge = { ref: string; label: string; km: number; measure: string };
type Station = { label: string; stationReference?: string; notation: string; lat: number; long: number; measures: { "@id": string }[] };

export async function gaugesNear(lat: number, lng: number, radiusKm = 15): Promise<Gauge[]> {
  const res = await fetch(`${EA}/id/stations?observedProperty=rainfall&lat=${lat}&long=${lng}&dist=${radiusKm}&_limit=100`);
  if (!res.ok) throw new Error(`EA stations ${res.status}`);
  const { items } = (await res.json()) as { items: Station[] };
  const km = (s: Station) => Math.hypot(s.lat - lat, (s.long - lng) * Math.cos((lat * Math.PI) / 180)) * 111.2;
  return items
    .map((s) => ({ ref: s.stationReference || s.notation, label: s.label, km: Math.round(km(s) * 10) / 10, measure: s.measures.map((m) => m["@id"]).find((id) => id.includes("rainfall-t-900")) }))
    .filter((g): g is Gauge => !!g.measure)
    .sort((a, b) => a.km - b.km);
}

const london = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
// EA times are UTC. A reading at T covers [T, T+15m), so it belongs to the local hour ending at floor(T + 1h).
export function hourEndingLabel(utc: string) {
  const p = Object.fromEntries(london.formatToParts(new Date(Date.parse(utc.endsWith("Z") ? utc : `${utc}Z`) + 3600e3)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}

const BAD = new Set(["Missing", "Suspect"]);

async function fetchYear(g: Gauge, year: number) {
  const res = await fetch(`${g.measure}/readings?mineq-date=${year}-01-01&maxeq-date=${year}-12-31&_limit=200000`);
  if (!res.ok) throw new Error(`EA readings ${res.status} for ${g.ref} ${year}`);
  const { items } = (await res.json()) as { items: { dateTime: string; value: number | null; quality: string }[] };
  const days = new Map<string, { mm: number[]; readings: number }>();
  for (const r of items) {
    const label = hourEndingLabel(r.dateTime), date = label.slice(0, 10);
    if (!date.startsWith(String(year))) continue; // 23:xx on 31 Dec belongs to next year's 1 Jan
    const d = days.get(date) ?? { mm: Array(24).fill(0), readings: 0 };
    if (r.value != null && !BAD.has(r.quality)) { d.mm[Number(label.slice(11, 13))] += r.value; d.readings++; }
    days.set(date, d);
  }
  return [...days].map(([date, d]) => ({ gauge_ref: g.ref, date, readings: d.readings, tenths: d.mm.map((v) => Math.round(v * 10)) }));
}

async function ensureCached(g: Gauge) {
  const db = admin();
  const { data: done } = await db.from("gauge_years").select("year").eq("gauge_ref", g.ref);
  const have = new Set((done ?? []).map((r) => r.year));
  for (let y = PRICING_YEARS.from; y <= PRICING_YEARS.to; y++) {
    if (have.has(y)) continue;
    const rows = await fetchYear(g, y);
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await db.from("gauge_days").upsert(rows.slice(i, i + 1000));
      if (error) throw new Error(`gauge_days upsert: ${error.message}`);
    }
    await db.from("gauge_years").upsert({ gauge_ref: g.ref, year: y });
  }
}

export async function gaugeHours(g: Gauge): Promise<{ hours: Hour[]; months: number }> {
  await ensureCached(g);
  const db = admin(), rows: { date: string; tenths: number[]; readings: number }[] = [];
  for (let from = 0; ; from += 1000) { // PostgREST returns at most 1000 rows per request
    const { data, error } = await db.from("gauge_days").select("date,tenths,readings").eq("gauge_ref", g.ref)
      .gte("date", `${PRICING_YEARS.from}-01-01`).lte("date", `${PRICING_YEARS.to}-12-31`).order("date").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const good = rows.filter((r) => r.readings >= MIN_READINGS);
  const perMonth = new Map<string, number>();
  for (const r of good) perMonth.set(r.date.slice(0, 7), (perMonth.get(r.date.slice(0, 7)) ?? 0) + 1);
  const daysIn = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
  const keep = new Set([...perMonth].filter(([m, n]) => n >= MIN_MONTH_COVERAGE * daysIn(m)).map(([m]) => m));
  const hours = good.filter((r) => keep.has(r.date.slice(0, 7)))
    .flatMap((r) => r.tenths.map((t, h) => ({ time: `${r.date}T${String(h).padStart(2, "0")}:00`, mm: t / 10 })));
  return { hours, months: keep.size };
}

// Nearest gauge with enough clean history. Tries the closest few, since gauges close and get replaced.
export async function pricingHistory(lat: number, lng: number) {
  for (const g of (await gaugesNear(lat, lng)).slice(0, 4)) {
    const h = await gaugeHours(g);
    if (h.months >= MIN_USABLE_MONTHS) return { gauge: g, ...h, years: `${PRICING_YEARS.from}–${PRICING_YEARS.to}` };
  }
  throw new Error("No rain gauge with enough history within 15km");
}
