// How often would rain cover pay out? Run: npm run rain -- "GU1 1AA"
import { geocode, history } from "../lib/weather.ts";
import { evaluateAll } from "../lib/trigger.ts";
import { quote } from "../lib/pricing.ts";

const postcode = process.argv[2] ?? "GU1 1AA";
const { lat, lng, district } = await geocode(postcode);
const hours = await history(lat, lng, "2016-01-01", "2025-12-31");
console.log(`${postcode} (${district}), 2016–2025, Mon–Fri 08:00–16:00, £60/day, 30% margin\n`);

const M = "JFMAMJJASOND";
const rows = [];
for (const wetHourMm of [0.5, 1])
  for (const minWetHours of [2, 3, 4]) {
    const days = evaluateAll(hours, { wetHourMm, minWetHours, startHour: 8, endHour: 16, workDays: [1, 2, 3, 4, 5] });
    for (const [capDays, excessDays] of [[4, 0], [4, 2], [6, 2]]) {
      const q = quote(days, { payout: 60, capDays, excessDays, margin: 0.3 });
      rows.push({
        trigger: `≥${minWetHours}h of ≥${wetHourMm}mm`,
        "cap/excess": `${capDays}/${excessDays}`,
        "qual days/mo": q.avgQualifyingDays,
        "paid days/mo": q.avgPaidDays,
        "£/month": q.monthlyPremium,
        "months maxed": `${Math.round(q.maxedOutShare * 100)}%`,
        "paid days by month": q.paidDaysByMonth.map((d, i) => `${M[i]}${d.toFixed(1)}`).join(" "),
      });
    }
  }
console.table(rows);
