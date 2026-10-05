import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDay, type Trigger, type Hour, type DayResult } from "./trigger.ts";
import { quoteWithExcess, price, LOADS } from "./pricing.ts";

const t: Trigger = { wetHourMm: 0.5, minWetHours: 2, startHour: 8, endHour: 16, workDays: [1, 2, 3, 4, 5] };
const day = (date: string, wet: number[]) =>
  Array.from({ length: 24 }, (_, h): Hour => ({ time: `${date}T${String(h).padStart(2, "0")}:00`, mm: wet.includes(h) ? 1 : 0 }));

test("trigger counts only wet hours inside the work window", () => {
  // 2026-10-05 is a Monday. Labels are hour-ending: 08 = 07–08 and 17 = 16–17, both outside 08:00–16:00.
  assert.equal(evaluateDay("2026-10-05", day("2026-10-05", [8, 17, 10]), t)?.met, false);
  assert.equal(evaluateDay("2026-10-05", day("2026-10-05", [9, 16]), t)?.met, true); // first and last working hours
  assert.equal(evaluateDay("2026-10-05", day("2026-10-05", [9]), t)?.borderline, true);
  assert.equal(evaluateDay("2026-10-04", day("2026-10-04", [9, 10]), t), null); // Sunday
});

// n qualifying days in each of the given months
const history = (perMonth: number[]): DayResult[] =>
  perMonth.flatMap((n, i) => Array.from({ length: 20 }, (_, d) => ({
    date: `${2010 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`,
    met: d < n, borderline: false, wetHours: 0, totalMm: 0,
  })));

test("excess comes off first, then the cap applies", () => {
  const q = quoteWithExcess(history([7, 7]), { payout: 60, capDays: 4 }, 2);
  assert.equal(q.avgPaidDays, 4); // 7 - 2 = 5, capped at 4
  assert.equal(q.expectedPayout, 240);
});

test("premium = expected + uncertainty + risk + expenses", () => {
  const q = quoteWithExcess(history([0, 2, 0, 2]), { payout: 60, capDays: 4 }, 0);
  const b = q.breakdown;
  assert.equal(b.expected, 60);
  assert.ok(b.uncertainty > 0 && b.risk > 0);
  assert.equal(q.monthlyPremium, Math.round((b.expected + b.uncertainty + b.risk + b.expenses) * 100) / 100);
  const loaded = quoteWithExcess(history([0, 2, 0, 2]), { payout: 60, capDays: 4 }, 0, 1.2);
  assert.equal(loaded.monthlyPremium, Math.round(q.monthlyPremium * 1.2 * 100) / 100); // busy-area loading multiplies the whole price
});

test("auto-excess only kicks in when cover would be poor value", () => {
  const plan = { payout: 60, capDays: 4 };
  const ceiling = LOADS.maxPremiumShare * 240;
  const rare = price(history(Array(24).fill(0).map((_, i) => (i % 4 === 0 ? 2 : 0))), plan)!;
  assert.equal(rare.excessDays, 0);
  const drizzly = price(history(Array(24).fill(0).map((_, i) => 4 + (i % 3))), plan)!; // 4–6 days every month
  assert.ok(drizzly.excessDays > 0 && drizzly.monthlyPremium <= ceiling);
});

test("simulated patterns land where the demo says they do", async () => {
  const { simulatedHours } = await import("./simulate.ts");
  const d = "2026-10-06"; // a Tuesday
  const run = (p: "washout" | "rainedOff" | "borderline" | "dry") => evaluateDay(d, simulatedHours(t, d, p), t)!;
  assert.equal(run("washout").met, true);
  assert.equal(run("rainedOff").met, true);
  assert.equal(run("rainedOff").borderline, false); // clear-cut: code pays, no judge
  assert.equal(run("borderline").met, false);
  assert.equal(run("borderline").borderline, true);
  assert.equal(run("dry").met, false);
});
