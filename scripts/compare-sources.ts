// Which weather source matches the real rain gauge? Run: npm run compare -- "GU1 4UR" 2024
import { geocode } from "../lib/weather.ts";
import { gaugesNear, gaugeHours } from "../lib/gauges.ts";
import { evaluateAll, type Hour, type Trigger } from "../lib/trigger.ts";

const postcode = process.argv[2] ?? "GU1 4UR", year = process.argv[3] ?? "2024";
const from = `${year}-01-01`, to = `${year}-12-31`;
const { lat, lng, district } = await geocode(postcode);
const g = (await gaugesNear(lat, lng))[0];
const gauge = { hours: (await gaugeHours(g)).hours.filter((h) => h.time.startsWith(year)) };
console.log(`${postcode} (${district}) vs ${g.label} gauge, ${g.km}km away, ${year} (complete months only)\n`);

const q = `latitude=${lat}&longitude=${lng}&hourly=precipitation&timezone=Europe%2FLondon&start_date=${from}&end_date=${to}`;
const MODELS: Record<string, string> = {
  era5: "archive-api.open-meteo.com/v1/archive",
  ecmwf_ifs: "archive-api.open-meteo.com/v1/archive",
  ukmo_uk_deterministic_2km: "historical-forecast-api.open-meteo.com/v1/forecast",
  icon_d2: "historical-forecast-api.open-meteo.com/v1/forecast",
};
const sources: Record<string, Hour[]> = { gauge: gauge.hours };
for (const [m, url] of Object.entries(MODELS)) {
  const { hourly } = await (await fetch(`https://${url}?${q}&models=${m}`)).json();
  sources[m] = hourly.time.map((time: string, i: number) => ({ time, mm: hourly.precipitation[i] ?? 0 }));
}

const base = { startHour: 8, endHour: 16, workDays: [1, 2, 3, 4, 5] };
const triggers: Record<string, Trigger> = {
  "any rain, 2h": { ...base, wetHourMm: 0.2, minWetHours: 2 },
  "steady rain, 3h": { ...base, wetHourMm: 0.5, minWetHours: 3 },
  "heavy rain, 2h": { ...base, wetHourMm: 1, minWetHours: 2 },
};
for (const [name, t] of Object.entries(triggers)) {
  const days = (h: Hour[]) => new Set(evaluateAll(h, t).filter((d) => d.met).map((d) => d.date));
  const truth = days(sources.gauge);
  console.log(`${name}: gauge says ${truth.size} days`);
  for (const [src, hours] of Object.entries(sources)) {
    if (src === "gauge") continue;
    const d = days(hours), hit = [...d].filter((x) => truth.has(x)).length;
    // hit rate = real lost days we'd pay; false alarms = paid days the gauge says were fine
    console.log(`  ${src.padEnd(27)} ${String(d.size).padStart(3)} days | caught ${hit}/${truth.size} (${Math.round((hit / (truth.size || 1)) * 100)}%) | false alarms ${d.size - hit}`);
  }
}
