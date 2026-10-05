// What would cover cost, priced on the real rain gauge vs the ERA5 model? Run: npm run rain -- "GU1 4UR"
import { geocode, history } from "../lib/weather.ts";
import { pricingHistory, PRICING_YEARS } from "../lib/gauges.ts";
import { evaluateAll } from "../lib/trigger.ts";
import { quote, DEFAULT_PLAN } from "../lib/pricing.ts";

const postcode = process.argv[2] ?? "GU1 4UR";
const { lat, lng, district } = await geocode(postcode);
const g = await pricingHistory(lat, lng);
const era5 = await history(lat, lng, `${PRICING_YEARS.from}-01-01`, `${PRICING_YEARS.to}-12-31`);
console.log(`${postcode} (${district}). Gauge: ${g.gauge.label}, ${g.gauge.km}km away, ${g.months} clean months of ${g.years}. Mon–Fri 08–16, £60/day, cap 4, 30% margin\n`);

const base = { startHour: 8, endHour: 16, workDays: [1, 2, 3, 4, 5] };
const rows = [];
for (const [name, t] of [["any rain, 2h", { wetHourMm: 0.2, minWetHours: 2 }], ["steady rain, 3h", { wetHourMm: 0.5, minWetHours: 3 }], ["steady rain, 4h", { wetHourMm: 0.5, minWetHours: 4 }], ["heavy rain, 2h", { wetHourMm: 1, minWetHours: 2 }]] as const) {
  const qg = quote(evaluateAll(g.hours, { ...base, ...t }), DEFAULT_PLAN);
  const qe = quote(evaluateAll(era5, { ...base, ...t }), DEFAULT_PLAN);
  rows.push({ trigger: name, "gauge days/mo": qg.avgQualifyingDays, "gauge £/mo": qg.monthlyPremium, "gauge capped": `${Math.round(qg.maxedOutShare * 100)}%`, "ERA5 days/mo": qe.avgQualifyingDays, "ERA5 £/mo": qe.monthlyPremium });
}
console.table(rows);
