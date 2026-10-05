"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the server page until PayPal's webhook (or a later check) moves the policy on.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
