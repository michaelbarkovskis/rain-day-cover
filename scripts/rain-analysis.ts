// What would cover cost on the gauge-based pricing model? Run: npm run rain -- "GU1 4UR"
import { geocode } from "../lib/weather.ts";
import { pricingHistory } from "../lib/gauges.ts";
import { evaluateAll } from "../lib/trigger.ts";
import { price, DEFAULT_PLAN } from "../lib/pricing.ts";

const postcode = process.argv[2] ?? "GU1 4UR";
const { lat, lng, district } = await geocode(postcode);
const g = await pricingHistory(lat, lng);
console.log(`${postcode} (${district}). Gauge: ${g.gauge.label}, ${g.gauge.km}km, ${g.months} clean months of ${g.years}. Mon–Fri 08–16, £60/day, cap 4\n`);

const base = { startHour: 8, endHour: 16, workDays: [1, 2, 3, 4, 5] };
const rows = [];
for (const [name, t] of [["any rain, 2h", { wetHourMm: 0.2, minWetHours: 2 }], ["any rain, 4h", { wetHourMm: 0.2, minWetHours: 4 }], ["steady rain, 2h", { wetHourMm: 0.5, minWetHours: 2 }], ["steady rain, 3h", { wetHourMm: 0.5, minWetHours: 3 }], ["heavy rain, 2h", { wetHourMm: 1, minWetHours: 2 }]] as const) {
  const q = price(evaluateAll(g.hours, { ...base, ...t }), DEFAULT_PLAN);
  if (!q) { rows.push({ trigger: name, "£/mo": "no fair quote" }); continue; }
  const b = q.breakdown;
  rows.push({
    trigger: name, "lost days/mo": q.avgQualifyingDays, "typical": q.typicalQualifyingDays, excess: q.excessDays,
    "£/mo": q.monthlyPremium, "= expected": b.expected, "+ uncert.": b.uncertainty, "+ risk": b.risk, "+ costs": b.expenses,
    "1-in-10 month £": q.oneInTenPayout, "ahead": `${Math.round(q.aheadShare * 100)}%`,
  });
}
console.table(rows);
