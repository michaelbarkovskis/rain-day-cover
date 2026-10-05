// Prices cover from historical trigger results. Pure.
import type { DayResult } from "./trigger.ts";

export type Plan = { payout: number; capDays: number };
export const DEFAULT_PLAN: Plan = { payout: 60, capDays: 4 };

// ponytail: fixed loads; a real insurer would set these from its capital and expense data.
export const LOADS = {
  uncertainty: 1,       // standard errors added to the average, because history is finite
  risk: 0.15,           // share of the month-to-month swing charged for the pool riding out wet runs
  expenses: 0.15,       // running costs and margin
  maxPremiumShare: 0.5, // never charge more than half of what a maximum month pays
  maxExcess: 8,
};

export type Quote = {
  excessDays: number;             // first N rained-off days each month aren't paid
  months: number;                 // months of history behind the price
  avgQualifyingDays: number;      // rained-off days per month, before excess and cap
  typicalQualifyingDays: number;  // median month
  avgPaidDays: number;
  paidDaysByMonth: number[];      // index 0 = Jan
  expectedPayout: number;         // £ per month on average
  oneInTenPayout: number;         // £ paid in a 1-in-10 wet month
  maxedOutShare: number;          // share of months that hit the cap
  aheadShare: number;             // share of months the payout beat the premium
  breakdown: { expected: number; uncertainty: number; risk: number; expenses: number };
  monthlyPremium: number;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => { const m = avg(xs); return Math.sqrt(avg(xs.map((x) => (x - m) ** 2))); };
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(p * s.length) - 1)] ?? 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

function monthlyCounts(days: DayResult[]) {
  const months = new Map<string, number>(); // "YYYY-MM" → qualifying days
  for (const d of days) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + (d.met ? 1 : 0));
  return [...months].map(([m, q]) => ({ cal: Number(m.slice(5, 7)) - 1, q }));
}

export function quoteWithExcess(days: DayResult[], p: Plan, excessDays: number): Quote {
  const rows = monthlyCounts(days).map((r) => ({ ...r, paid: Math.min(Math.max(r.q - excessDays, 0), p.capDays) }));
  const pay = rows.map((r) => r.paid * p.payout);
  const expected = avg(pay), swing = sd(pay);
  const uncertainty = (LOADS.uncertainty * swing) / Math.sqrt(rows.length || 1);
  const risk = LOADS.risk * swing;
  const expenses = (expected + uncertainty + risk) * LOADS.expenses;
  const monthlyPremium = r2(expected + uncertainty + risk + expenses);
  return {
    excessDays,
    months: rows.length,
    avgQualifyingDays: r2(avg(rows.map((r) => r.q))),
    typicalQualifyingDays: pct(rows.map((r) => r.q), 0.5),
    avgPaidDays: r2(avg(rows.map((r) => r.paid))),
    paidDaysByMonth: Array.from({ length: 12 }, (_, i) => r2(avg(rows.filter((r) => r.cal === i).map((r) => r.paid)))),
    expectedPayout: r2(expected),
    oneInTenPayout: pct(pay, 0.9),
    maxedOutShare: r2(rows.filter((r) => r.paid === p.capDays).length / (rows.length || 1)),
    aheadShare: r2(pay.filter((x) => x > monthlyPremium).length / (pay.length || 1)),
    breakdown: { expected: r2(expected), uncertainty: r2(uncertainty), risk: r2(risk), expenses: r2(expenses) },
    monthlyPremium,
  };
}

// Smallest excess that makes the cover fair value. Weather that's normal every month isn't insurable,
// so if a trigger fires most months, the first few days become the roofer's own, like an insurance excess.
export function price(days: DayResult[], p: Plan): Quote | null {
  const ceiling = LOADS.maxPremiumShare * p.capDays * p.payout;
  for (let excess = 0; excess <= LOADS.maxExcess; excess++) {
    const q = quoteWithExcess(days, p, excess);
    if (q.monthlyPremium <= ceiling) return q;
  }
  return null;
}
