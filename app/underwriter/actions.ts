"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "../actions";

const COOKIE = "uw";
const digest = (s: string) => createHash("sha256").update(s).digest();

export async function isUnderwriter() {
  const pass = process.env.UNDERWRITER_PASSCODE, got = (await cookies()).get(COOKIE)?.value;
  if (!pass || !got) return false;
  const a = Buffer.from(got, "hex"), b = digest(pass);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function unlockUnderwriter(_: FormState, form: FormData): Promise<FormState> {
  const pass = process.env.UNDERWRITER_PASSCODE;
  const tried = digest(String(form.get("passcode") ?? "")), real = pass ? digest(pass) : null;
  if (!real || !timingSafeEqual(tried, real)) return { error: "That passcode isn't right." };
  (await cookies()).set(COOKIE, real.toString("hex"), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/underwriter" });
  redirect("/underwriter");
}
