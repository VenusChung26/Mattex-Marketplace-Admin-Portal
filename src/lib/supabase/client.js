import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "../supabasePersist.js";

/** Browser Supabase client for this Vite SPA (not Next.js). */
export function createClient() {
  const { url, anon } = supabaseConfig();
  if (!url || !anon) return null;
  return createBrowserClient(url, anon);
}
