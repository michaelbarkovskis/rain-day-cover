// Pre-loads gauge history for the Surrey pilot so first quotes are fast. Run: npm run gauges:warm
import { pricingHistory } from "../lib/gauges.ts";

const OUTCODES = ["GU1", "GU2", "GU7", "GU9", "GU15", "GU21", "GU27", "GU6", "RH1", "RH2", "RH4", "KT13", "KT18", "KT22", "TW18"];
for (const oc of OUTCODES) {
  const { result } = await (await fetch(`https://api.postcodes.io/outcodes/${oc}`)).json();
  const t = Date.now();
  try {
    const g = await pricingHistory(result.latitude, result.longitude);
    console.log(`${oc.padEnd(5)} ${result.admin_district[0].padEnd(20)} → ${g.gauge.label} (${g.gauge.km}km), ${g.months} months  [${((Date.now() - t) / 1000).toFixed(0)}s]`);
  } catch (e) {
    console.log(`${oc.padEnd(5)} ${result.admin_district[0].padEnd(20)} → ✗ ${(e as Error).message}`);
  }
}
