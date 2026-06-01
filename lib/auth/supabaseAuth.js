import { supabase } from "../supabase/client.js";
import { loadStoreFromSupabase } from "../db/loadStore.js";

/** Map profile + salary to app user shape (no password field) */
export async function fetchAppUserByAuthId(authUserId) {
  const store = await loadStoreFromSupabase();
  return store.users.find((u) => u.id === authUserId) || null;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  const appUser = await fetchAppUserByAuthId(data.user.id);
  if (!appUser?.active) {
    await supabase.auth.signOut();
    return { ok: false, error: "Account is inactive or profile missing. Contact admin." };
  }
  return { ok: true, user: appUser, session: data.session };
}

export async function signUpAdmin({ email, password, name }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: "admin" },
    },
  });
  if (error) return { ok: false, error: error.message };
  if (data.user) {
    await supabase.from("profiles").update({ role: "admin", name, tour_done: true }).eq("id", data.user.id);
  }
  return { ok: true, user: data.user, needsEmailConfirm: !data.session };
}

export async function signUpStaff({ email, password, name, role = "staff" }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role } },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, userId: data.user?.id };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) return null;
  const appUser = await fetchAppUserByAuthId(data.session.user.id);
  return appUser;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const appUser = await fetchAppUserByAuthId(session.user.id);
      callback(event, appUser);
    } else {
      callback(event, null);
    }
  });
}
