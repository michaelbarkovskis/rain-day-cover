// Run the trigger check for one policy on given dates, whatever its status. Run: npm run check -- <policyId> 2026-09-08 2026-09-30
import { admin } from "../lib/db.ts";
import { checkPolicyDay, type PolicyForCheck } from "../lib/checks.ts";

const [id, ...dates] = process.argv.slice(2);
const { data, error } = await admin().from("policies").select("id, created_at, cover_starts_on, trigger_json, quote_json, profiles(lat, lng)").eq("id", id).single();
if (error) throw new Error(error.message);
for (const d of dates) console.log(await checkPolicyDay(data as unknown as PolicyForCheck, d) ?? `${d}: not a working day`);
