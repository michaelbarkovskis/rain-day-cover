// Postcode lookup (postcodes.io) and hourly rain (Open-Meteo). No keys needed.
import type { Hour } from "./trigger.ts";

export async function geocode(postcode: string) {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
  if (!res.ok) throw new Error(`Unknown postcode: ${postcode}`);
  const { result } = await res.json();
  return { lat: result.latitude as number, lng: result.longitude as number, district: result.admin_district as string };
}

async function hourly(url: string): Promise<Hour[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  const { hourly } = await res.json();
  return hourly.time.map((time: string, i: number) => ({ time, mm: hourly.precipitation[i] ?? 0 }));
}

const q = (lat: number, lng: number) => `latitude=${lat}&longitude=${lng}&hourly=precipitation&timezone=Europe%2FLondon`;

// ponytail: per-instance memory cache; move to a DB table if cold starts make quotes slow.
const cache = new Map<string, Promise<Hour[]>>();
export function history(lat: number, lng: number, from: string, to: string) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${from},${to}`;
  if (!cache.has(key)) {
    const p = hourly(`https://archive-api.open-meteo.com/v1/archive?${q(lat, lng)}&start_date=${from}&end_date=${to}`);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

export const forecast = (lat: number, lng: number, days = 2) =>
  hourly(`https://api.open-meteo.com/v1/forecast?${q(lat, lng)}&forecast_days=${days}`);

// Environment Agency rain gauges (free, no key): 15-minute totals, decades of history, near real time.
const EA = "https://environment.data.gov.uk/hydrology";

export async function nearestGauge(lat: number, lng: number, km = 15) {
  const res = await fetch(`${EA}/id/stations?observedProperty=rainfall&lat=${lat}&long=${lng}&dist=${km}&_limit=50`);
  const { items } = await res.json();
  const dist = (s: { lat: number; long: number }) => Math.hypot(s.lat - lat, (s.long - lng) * Math.cos((lat * Math.PI) / 180)) * 111;
  const s = items.sort((a: { lat: number; long: number }, b: { lat: number; long: number }) => dist(a) - dist(b))[0];
  if (!s) throw new Error(`No rain gauge within ${km}km`);
  const measure = s.measures.map((m: { "@id": string }) => m["@id"]).find((id: string) => id.includes("rainfall-t-900"));
  return { label: s.label as string, km: Math.round(dist(s) * 10) / 10, measure: measure as string, opened: s.dateOpened as string };
}

const london = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
// A reading at UTC time T covers [T, T+15m), so it belongs to the local hour ending at floor(T + 1h).
const hourEndingLabel = (utc: string) => {
  const p = Object.fromEntries(london.formatToParts(new Date(Date.parse(`${utc}Z`) + 3600e3)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
};

export async function gaugeHistory(measure: string, from: string, to: string): Promise<{ hours: Hour[]; missing: number }> {
  const res = await fetch(`${measure}/readings?mineq-date=${from}&maxeq-date=${to}&_limit=2000000`);
  if (!res.ok) throw new Error(`EA ${res.status}`);
  const { items } = await res.json();
  const byHour = new Map<string, number>();
  let missing = 0;
  for (const r of items as { dateTime: string; value: number | null; quality: string }[]) {
    if (r.value == null || r.quality === "Missing") { missing++; continue; }
    const k = hourEndingLabel(r.dateTime);
    byHour.set(k, (byHour.get(k) ?? 0) + r.value);
  }
  return { hours: [...byHour].map(([time, mm]) => ({ time, mm: Math.round(mm * 10) / 10 })), missing };
}
