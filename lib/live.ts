// Same-day rain for the payout trigger: nearest live Environment Agency gauge, Met Office 2km model as backup.
import { hourEndingLabel } from "./gauges.ts";
import type { Hour, Trigger } from "./trigger.ts";

const RT = "https://environment.data.gov.uk/flood-monitoring";
const MIN_COVERAGE = 0.9; // share of 15-minute readings in the work window; below this the gauge can't decide the day

export type LiveGauge = { ref: string; label: string; km: number };
export type DayRain = { source: "gauge" | "model"; gauge: LiveGauge | null; coverage: number | null; hours: Hour[]; note?: string };

// Nearest gauges that have reported in the last 6 hours. Pinned into the policy at quote time.
export async function liveGaugesNear(lat: number, lng: number, radiusKm = 10): Promise<LiveGauge[]> {
  const { items } = await (await fetch(`${RT}/id/stations?parameter=rainfall&lat=${lat}&long=${lng}&dist=${radiusKm}`)).json();
  const km = (s: { lat: number; long: number }) => Math.hypot(s.lat - lat, (s.long - lng) * Math.cos((lat * Math.PI) / 180)) * 111.2;
  const near = (items as { stationReference: string; lat: number; long: number }[])
    .map((s) => ({ ref: s.stationReference, lat: s.lat, long: s.long, km: Math.round(km(s) * 10) / 10 }))
    .sort((a, b) => a.km - b.km);
  const live: LiveGauge[] = [];
  for (const g of near.slice(0, 5)) {
    const r = await (await fetch(`${RT}/id/stations/${g.ref}/readings?_sorted&_limit=1`)).json();
    const last = r.items?.[0]?.dateTime;
    if (!last || Date.now() - Date.parse(last) > 6 * 3600e3) continue;
    // Real-time stations are all labelled "Rainfall station", so name them after the nearest ward.
    const place = await (await fetch(`https://api.postcodes.io/postcodes?lon=${g.long}&lat=${g.lat}&limit=1&radius=2000`)).json();
    const area = place.result?.[0]?.admin_ward ?? place.result?.[0]?.admin_district;
    live.push({ ref: g.ref, km: g.km, label: area ? `${area} (gauge ${g.ref})` : `gauge ${g.ref}` });
  }
  return live;
}

// Real-time readings are 15-minute totals stamped at the END of the period (hydrology archive stamps the start),
// so shift back 15 minutes before labelling. ponytail: EA doesn't document this; a 15-minute edge error at most.
async function gaugeDay(ref: string, date: string) {
  const { items } = await (await fetch(`${RT}/id/stations/${ref}/readings?startdate=${date}&enddate=${date}&_limit=500`)).json();
  const byHour = new Map<string, { mm: number; n: number }>();
  for (const r of items as { dateTime: string; value: number }[]) {
    const label = hourEndingLabel(new Date(Date.parse(r.dateTime) - 15 * 60e3).toISOString().slice(0, 19));
    const h = byHour.get(label) ?? { mm: 0, n: 0 };
    h.mm += r.value; h.n++;
    byHour.set(label, h);
  }
  return byHour;
}

async function modelDay(lat: number, lng: number, date: string): Promise<Hour[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&models=ukmo_uk_deterministic_2km&timezone=Europe%2FLondon&start_date=${date}&end_date=${date}`;
  const { hourly } = await (await fetch(url)).json();
  return hourly.time.map((time: string, i: number) => ({ time, mm: hourly.precipitation[i] ?? 0 }));
}

export async function dayRain(where: { lat: number; lng: number; gauge: LiveGauge | null }, date: string, t: Trigger): Promise<DayRain> {
  if (where.gauge) {
    const byHour = await gaugeDay(where.gauge.ref, date);
    const window = Array.from({ length: t.endHour - t.startHour }, (_, i) => `${date}T${String(t.startHour + 1 + i).padStart(2, "0")}:00`);
    const coverage = window.reduce((s, k) => s + Math.min(byHour.get(k)?.n ?? 0, 4), 0) / (window.length * 4);
    if (coverage >= MIN_COVERAGE) {
      return { source: "gauge", gauge: where.gauge, coverage, hours: [...byHour].map(([time, h]) => ({ time, mm: Math.round(h.mm * 10) / 10 })) };
    }
    return { source: "model", gauge: where.gauge, coverage, hours: await modelDay(where.lat, where.lng, date), note: `Gauge only reported ${Math.round(coverage * 100)}% of readings in working hours` };
  }
  return { source: "model", gauge: null, coverage: null, hours: await modelDay(where.lat, where.lng, date), note: "No live gauge pinned to this policy" };
}
