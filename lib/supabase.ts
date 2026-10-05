import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Acts as the signed-in user; RLS applies.
export async function userClient() {
  const store = await cookies();
  return createServerClient(url(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components can't set cookies; Server Actions can. Refresh happens on the next action.
        // ponytail: no proxy.ts session refresh; add it if sessions outlive the 1h JWT in practice.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}

export { admin } from "./db.ts";

export async function currentUser() {
  const { data } = await (await userClient()).auth.getUser();
  return data.user;
}
