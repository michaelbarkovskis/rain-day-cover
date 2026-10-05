import { redirect } from "next/navigation";
import { ActionForm } from "../action-form";
import { buildPolicy } from "../actions";
import { admin, currentUser } from "@/lib/supabase";

const EXAMPLES = [
  "I can carry on in drizzle but once it's raining properly for a couple of hours the day's gone. Felt and slates can't go down wet.",
  "Any rain at all and I'm off the roof, it's too slippery on slate. I work 7 till 3, Monday to Saturday.",
];

export default async function Describe() {
  const user = await currentUser();
  const { data: profile } = user ? await admin().from("profiles").select("name").eq("id", user.id).maybeSingle() : { data: null };
  if (!profile) redirect("/start");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Thanks {profile.name}. When does rain stop you?</h1>
        <p className="text-muted">Describe it like you’d tell a mate. Our assistant turns it into your cover rules, and you’ll see exactly what it understood.</p>
      </div>
      <div className="card">
        <ActionForm action={buildPolicy} submit="Build my cover" pending="Checking 15 years of measured rain near you…">
          <div>
            <label className="label" htmlFor="description">Your words</label>
            <textarea className="field min-h-36" id="description" name="description" maxLength={1000} required placeholder={EXAMPLES[0]} />
          </div>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">See examples</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{EXAMPLES.map((e) => <li key={e}>“{e}”</li>)}</ul>
          </details>
        </ActionForm>
      </div>
    </div>
  );
}
