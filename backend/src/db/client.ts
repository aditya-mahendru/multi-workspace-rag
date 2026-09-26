import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Server-only client using the service role key. Every query in this codebase
// must still explicitly filter by workspace_id — RLS below is defense-in-depth,
// not a substitute for the application-level check.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
