// Deterministic trigger evaluation. Pure: hourly data in, decision out.

export type Trigger = {
  wetHourMm: number;   // an hour counts as wet at or above this rainfall (mm)
  minWetHours: number; // wet hours inside the work window needed to qualify
  startHour: number;   // work window, local time, [startHour, endHour)
  endHour: number;
  workDays: number[];  // ISO weekday, 1 = Monday
};

// time = local "YYYY-MM-DDTHH:mm" labelling the END of the hour (Open-Meteo convention: 09:00 = rain 08:00–09:00).
export type Hour = { time: string; mm: number };

export type DayResult = { date: string; met: boolean; borderline: boolean; wetHours: number; totalMm: number };

export const isoWeekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

// ponytail: ignores bank holidays; add a holiday list if pricing needs that precision.
export function evaluateDay(date: string, hours: Hour[], t: Trigger): DayResult | null {
  if (!t.workDays.includes(isoWeekday(date))) return null;
  const work = hours.filter((h) => {
    const hr = Number(h.time.slice(11, 13)); // hour-ending label, so 08:00–16:00 is labels 09..16
    return h.time.startsWith(date) && hr > t.startHour && hr <= t.endHour;
  });
  const wetHours = work.filter((h) => h.mm >= t.wetHourMm).length;
  const totalMm = Math.round(work.reduce((s, h) => s + h.mm, 0) * 10) / 10;
  const met = wetHours >= t.minWetHours;
  // One hour either side of the line goes to the AI claims judge.
  const borderline = Math.abs(wetHours - t.minWetHours) <= 1 && wetHours > 0;
  return { date, met, borderline, wetHours, totalMm };
}

export function evaluateAll(hours: Hour[], t: Trigger): DayResult[] {
  const byDate = Map.groupBy(hours, (h) => h.time.slice(0, 10));
  return [...byDate].map(([date, hs]) => evaluateDay(date, hs, t)).filter((d) => d !== null);
}
