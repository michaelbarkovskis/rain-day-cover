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
