// Prices cover from historical trigger results. Pure.
import type { DayResult } from "./trigger.ts";

export type Plan = { payout: number; capDays: number; excessDays: number; margin: number };

export type Quote = {
  avgQualifyingDays: number;          // per month, before excess/cap
  avgPaidDays: number;                // per month, after excess/cap
  paidDaysByMonth: number[];          // index 0 = Jan, average paid days in that calendar month
  monthlyPremium: number;
  maxedOutShare: number;              // share of months that hit the cap (want this low)
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function quote(days: DayResult[], p: Plan): Quote {
  const months = new Map<string, number>(); // "YYYY-MM" → qualifying days
  for (const d of days) {
    const m = d.date.slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + (d.met ? 1 : 0));
  }
  const rows = [...months].map(([m, q]) => ({
    cal: Number(m.slice(5, 7)) - 1,
    q,
    paid: Math.min(Math.max(q - p.excessDays, 0), p.capDays),
  }));
  const avgPaidDays = avg(rows.map((r) => r.paid));
  return {
    avgQualifyingDays: r2(avg(rows.map((r) => r.q))),
    avgPaidDays: r2(avgPaidDays),
    paidDaysByMonth: Array.from({ length: 12 }, (_, i) => r2(avg(rows.filter((r) => r.cal === i).map((r) => r.paid)))),
    monthlyPremium: r2(avgPaidDays * p.payout * (1 + p.margin)),
    maxedOutShare: r2(rows.filter((r) => r.paid === p.capDays).length / (rows.length || 1)),
  };
}

// Working defaults until roofer research says otherwise (see AGENTS.md "Decisions so far").
export const DEFAULT_PLAN: Plan = { payout: 60, capDays: 4, excessDays: 0, margin: 0.3 };
