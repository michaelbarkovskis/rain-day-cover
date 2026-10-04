import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDay, type Trigger, type Hour } from "./trigger.ts";
import { quote } from "./pricing.ts";

const t: Trigger = { wetHourMm: 0.5, minWetHours: 2, startHour: 8, endHour: 16, workDays: [1, 2, 3, 4, 5] };
const day = (date: string, wet: number[]) =>
  Array.from({ length: 24 }, (_, h): Hour => ({ time: `${date}T${String(h).padStart(2, "0")}:00`, mm: wet.includes(h) ? 1 : 0 }));

test("trigger counts only wet hours inside the work window", () => {
  // 2026-10-05 is a Monday. Rain at 7am and 4pm is outside 8–16.
  assert.equal(evaluateDay("2026-10-05", day("2026-10-05", [7, 9, 16]), t)?.met, false);
  assert.equal(evaluateDay("2026-10-05", day("2026-10-05", [9, 10]), t)?.met, true);
  assert.equal(evaluateDay("2026-10-05", day("2026-10-05", [9]), t)?.borderline, true);
  assert.equal(evaluateDay("2026-10-04", day("2026-10-04", [9, 10]), t), null); // Sunday
});

test("pricing applies excess then cap", () => {
  const met = (date: string) => ({ date, met: true, borderline: false, wetHours: 3, totalMm: 3 });
  const days = ["01", "02", "05", "06", "07", "08", "09"].map((d) => met(`2025-01-${d}`)); // 7 qualifying days
  const q = quote(days, { payout: 60, capDays: 4, excessDays: 2, margin: 0 });
  assert.equal(q.avgPaidDays, 4); // 7 - 2 = 5, capped at 4
  assert.equal(q.monthlyPremium, 240);
  assert.equal(q.maxedOutShare, 1);
});
