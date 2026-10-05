// Demo rain patterns, built from the policy's own trigger so they behave the same for any roofer. Pure.
import type { Hour, Trigger } from "./trigger.ts";

export const PATTERNS = {
  washout: "Washout: steady rain all working day",
  rainedOff: "Rained off: rain for a few hours past the line",
  borderline: "Borderline: one hour short, plus an hour just under the threshold",
  dry: "Dry day: a passing shower only",
} as const;
export type Pattern = keyof typeof PATTERNS;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function simulatedHours(t: Trigger, date: string, pattern: Pattern): Hour[] {
  const work = Array.from({ length: t.endHour - t.startHour }, (_, i) => t.startHour + 1 + i); // hour-ending labels
  const mm = new Map<number, number>();
  if (pattern === "washout") work.forEach((h) => mm.set(h, r1(Math.max(2, t.wetHourMm * 3))));
  // Two hours past the line: one past would count as borderline and go to the AI judge instead of paying outright.
  if (pattern === "rainedOff") work.slice(1, 1 + t.minWetHours + 2).forEach((h) => mm.set(h, r1(t.wetHourMm * 2.5)));
  if (pattern === "borderline") {
    work.slice(1, t.minWetHours).forEach((h) => mm.set(h, r1(t.wetHourMm * 2)));   // minWetHours - 1 wet hours
    mm.set(work[t.minWetHours], r1(t.wetHourMm * 0.8));                             // then one just under the line
  }
  if (pattern === "dry") mm.set(work[2], 0.1);
  return Array.from({ length: 24 }, (_, h) => ({ time: `${date}T${String(h).padStart(2, "0")}:00`, mm: mm.get(h) ?? 0 }));
}
