// AI role 1: a roofer's plain-English description → a structured rain trigger.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./shared.ts";

// Chosen by eval: Haiku 4.5 scored ~95% across runs, see README.
export const PARSE_MODEL = process.env.POLICY_MODEL ?? "claude-sonnet-5-5";
import type { Trigger } from "../trigger.ts";

export const ParsedWork = z.object({
  understood: z.boolean().describe("false only if the text isn't about outdoor trade work"),
  wetness: z.enum(["light", "steady", "heavy"]).describe("the lightest rain that stops their work"),
  minWetHours: z.number().int().describe("hours of that rain inside working hours that cost them the day"),
  startHour: z.number().int().nullable().describe("work start hour 0-23, only if stated"),
  endHour: z.number().int().nullable().describe("work end hour 0-23, only if stated"),
  workDays: z.array(z.number().int()).nullable().describe("ISO weekdays 1=Mon..7=Sun, only if stated"),
  summary: z.string().describe("one sentence to the roofer, second person, what we understood"),
  assumptions: z.array(z.string()).describe("anything guessed rather than stated, short, second person"),
});
export type ParsedWork = z.infer<typeof ParsedWork>;

const SYSTEM = `You turn a UK roofer's description of their work into a rain-cover trigger.

wetness = the lightest rain that stops them working:
- "light": drizzle or any rain stops them (wet slates, slippery, felt can't go down)
- "steady": they work through drizzle but proper, steady rain stops them
- "heavy": only downpours or heavy rain stop them
Go by their own words for the rain that stops them: "heavy", "downpour", "chucking it down" mean "heavy", even if they also say drizzle is fine.
If unclear, choose "steady" and say so in assumptions.

minWetHours = how many hours of that rain in their working day cost them the day:
- a number of hours is stated → use it ("3 hours" → 3, "a good 4 hours" → 4)
- "an hour or so", "a couple of hours", "any rain at all" → 2
- "a few hours", "half the day" → 4
- "most of the day", "most of the morning and afternoon", "all day" → 6
- not stated → 3, and add an assumption telling them you assumed about 3 hours
Never below 2 or above 8.

Only fill startHour, endHour, workDays when the text states them; otherwise null.
We already have their usual hours and days from sign-up, so never list missing hours or days as assumptions.
Write summary and assumptions to the roofer in plain English. No jargon, no mm figures.
If the text isn't about outdoor trade work, set understood=false.
If it is about their work but vague, still set understood=true: use the defaults above and say what you assumed.`;

export async function parseWork(description: string): Promise<ParsedWork> {
  const res = await anthropic().messages.parse({
    model: PARSE_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: description }],
    output_config: { format: zodOutputFormat(ParsedWork), ...(PARSE_MODEL.includes("haiku") ? {} : { effort: "low" as const }) },
  });
  if (!res.parsed_output) throw new Error(`Policy builder returned no parseable output (stop: ${res.stop_reason})`);
  return res.parsed_output;
}

const MM = { light: 0.2, steady: 0.5, heavy: 1 } as const;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

// Code, not the model, decides the final numbers and bounds.
export function toTrigger(p: ParsedWork, defaults: Pick<Trigger, "startHour" | "endHour" | "workDays">): Trigger {
  let startHour = p.startHour ?? defaults.startHour, endHour = p.endHour ?? defaults.endHour;
  if (!(startHour >= 4 && endHour <= 22 && endHour - startHour >= 4)) ({ startHour, endHour } = defaults);
  const days = (p.workDays ?? defaults.workDays).filter((d) => d >= 1 && d <= 7);
  return {
    wetHourMm: MM[p.wetness],
    minWetHours: clamp(p.minWetHours, 2, Math.min(8, endHour - startHour)),
    startHour,
    endHour,
    workDays: days.length ? [...new Set(days)].sort() : defaults.workDays,
  };
}
