import Anthropic from "@anthropic-ai/sdk";
import { admin } from "../db.ts";

export const FAST_MODEL = "claude-haiku-4-5";

let client: Anthropic | null = null;
export const anthropic = () => (client ??= new Anthropic());

type DecisionType = "policy_builder" | "pricer" | "claims_judge" | "risk_manager";

// Every AI decision is kept for the underwriter dashboard. Logging must never break the user flow.
export async function logDecision(type: DecisionType, model: string, input: unknown, output: unknown, reasoning: string | null, policyId: string | null = null) {
  const { error } = await admin().from("ai_decisions_log").insert({ type, model, input_json: input, output_json: output, reasoning, policy_id: policyId });
  if (error) console.error("ai_decisions_log insert failed", error.message);
}
