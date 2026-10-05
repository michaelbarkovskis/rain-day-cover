// Scores the AI policy builder against evals/policy-builder.json. Run: npm run eval
// Checks the final trigger (after code clamps), since that's what drives pricing and payouts.
import { readFileSync } from "node:fs";
import { parseWork, toTrigger, type ParsedWork } from "../lib/ai/policy-builder.ts";

type Expect = Partial<{ understood: boolean; wetness: ParsedWork["wetness"]; minWetHours: [number, number]; startHour: number; endHour: number; workDays: number[]; assumptions: boolean }>;
const cases: { text: string; expect: Expect }[] = JSON.parse(readFileSync("evals/policy-builder.json", "utf8"));
const defaults = { startHour: 8, endHour: 16, workDays: [1, 2, 3, 4, 5] };
const MM = { light: 0.2, steady: 0.5, heavy: 1 };

let passed = 0;
for (const c of cases) {
  const p = await parseWork(c.text);
  const t = toTrigger(p, defaults);
  const e = c.expect, fails: string[] = [];
  if (e.understood !== undefined && p.understood !== e.understood) fails.push(`understood=${p.understood}`);
  if (e.understood !== false) {
    if (e.wetness && t.wetHourMm !== MM[e.wetness]) fails.push(`wetness=${p.wetness}`);
    if (e.minWetHours && (t.minWetHours < e.minWetHours[0] || t.minWetHours > e.minWetHours[1])) fails.push(`minWetHours=${t.minWetHours}`);
    if (e.startHour !== undefined && t.startHour !== e.startHour) fails.push(`startHour=${t.startHour}`);
    if (e.endHour !== undefined && t.endHour !== e.endHour) fails.push(`endHour=${t.endHour}`);
    if (e.workDays && t.workDays.join() !== e.workDays.join()) fails.push(`workDays=${t.workDays}`);
    if (e.assumptions && p.assumptions.length === 0) fails.push("no assumptions stated");
  }
  if (!fails.length) passed++;
  console.log(`${fails.length ? "✗" : "✓"} ${c.text.slice(0, 70)}${fails.length ? `  → ${fails.join(", ")}` : ""}`);
}
console.log(`\nPolicy builder: ${passed}/${cases.length} correct`);
