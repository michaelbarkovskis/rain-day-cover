// Run the trigger check and claim for one policy on given dates (claims still apply status and cover-start rules). Run: npm run check -- <policyId> 2026-09-08 2026-09-30
import { admin } from "../lib/db.ts";
import { checkPolicyDay, type PolicyForCheck } from "../lib/checks.ts";
import { processDay, CLAIM_POLICY_COLUMNS, type ClaimPolicy } from "../lib/claims.ts";

const [id, ...dates] = process.argv.slice(2);
const { data, error } = await admin().from("policies").select(CLAIM_POLICY_COLUMNS).eq("id", id).single();
if (error) throw new Error(error.message);
const policy = data as unknown as PolicyForCheck & ClaimPolicy;
for (const d of dates) {
  const check = await checkPolicyDay(policy, d);
  console.log(check ?? `${d}: not a working day`);
  if (check) console.log("  claim →", await processDay(policy, d));
}
