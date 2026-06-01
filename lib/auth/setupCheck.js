import { supabase } from "../supabase/client.js";

/** Callable without login — used on login screen for first-time admin setup. */
export async function checkNeedsAdminSetup() {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("needs_admin_setup");
  if (error) {
    console.warn("needs_admin_setup RPC failed", error.message);
    return false;
  }
  return !!data;
}
