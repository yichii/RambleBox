import { createClient } from "jsr:@supabase/supabase-js@2";

// Service-role client for Edge Functions only — bypasses RLS. Never ship
// this key to the mobile client. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are auto-injected into every Edge Function's environment by Supabase.
export function createSupabaseAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
