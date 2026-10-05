"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pending }: { children: React.ReactNode; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return <button className="btn" disabled={isPending}>{isPending ? pending : children}</button>;
}
