"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

export function ActionForm({ action, submit, pending, children }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submit: string;
  pending: string;
  children: React.ReactNode;
}) {
  const [state, run, isPending] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-5">
      <fieldset disabled={isPending} className="space-y-5">{children}</fieldset>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button className="btn" disabled={isPending}>{isPending ? pending : submit}</button>
    </form>
  );
}
