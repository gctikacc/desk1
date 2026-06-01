import { normalizeEnterpriseStore } from "../enterpriseStore.js";
import { getSalaryLabels } from "../constants.js";
import { loadStoreFromSupabase } from "./loadStore.js";
import { persistStoreToSupabase } from "./persistStore.js";
import { supabase } from "../supabase/client.js";

let cache = null;
let ready = false;
let bootError = null;
let persistTimer = null;
let saving = false;

const prepare = (raw) => {
  const data = raw ? JSON.parse(JSON.stringify(raw)) : emptyStore();
  if (!data.settings) data.settings = {};
  data.settings.salaryTypeLabels = getSalaryLabels(data.settings);
  return normalizeEnterpriseStore(data);
};

export const emptyStore = () => ({
  settings: {
    companyName: "Alvin Desk",
    locationRestriction: false,
    locationLat: 24.8607,
    locationLng: 67.0011,
    locationRadiusFeet: 150,
    alertDelayMinutes: 30,
    gracePeriodMinutes: 10,
    lateThresholdMinutes: 15,
    sessionTimeoutMinutes: 60,
    unusedLeavePolicy: "admin_decide",
    leaveTrackingPeriod: "yearly",
  },
  leaveTypes: [],
  departments: [],
  shifts: [],
  deptShifts: {},
  users: [],
  attendance: [],
  leaves: [],
  offDays: [],
  resolvedHolidays: [],
  corrections: [],
  advanceSalaryRequests: [],
  advanceInstallments: [],
  advanceApprovals: [],
  advanceAuditLogs: [],
  advanceRequests: [],
  salaryHistory: [],
  salarySchedules: [],
  notifications: [],
  alerts: [],
  announcements: [],
  auditLog: [],
  auditArchive: [],
  enterpriseAuditLogs: [],
  exportHistory: [],
  passwordResets: [],
  historyRequests: [],
  officeLocations: [],
  locationPunches: [],
  payrollRuns: [],
  payslips: [],
  loginActivity: [],
});

export async function initStore(force = false) {
  if (ready && cache && !force) return cache;
  try {
    const loaded = await loadStoreFromSupabase();
    cache = prepare(loaded);
    bootError = null;
  } catch (e) {
    console.error("loadStoreFromSupabase failed", e);
    bootError = e?.message || String(e);
    cache = prepare(emptyStore());
  }
  ready = true;
  return cache;
}

export function getStoreSource() {
  return "supabase";
}

export function getStore() {
  if (!cache) cache = prepare(emptyStore());
  return cache;
}

/** Clear in-memory cache after logout (no Supabase reads without session). */
export function resetStoreCache() {
  cache = prepare(emptyStore());
  ready = true;
  bootError = null;
  return cache;
}

export function updateStore(fn) {
  const next = fn(JSON.parse(JSON.stringify(getStore())));
  if (next.auditLog?.length > 500) next.auditLog = next.auditLog.slice(0, 500);
  cache = prepare(next);
  schedulePersist(cache);
  return cache;
}

function schedulePersist(payload) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    saving = true;
    try {
      await persistStoreToSupabase(payload);
      bootError = null;
    } catch (e) {
      console.error("Persist failed", e);
      bootError = e?.message || String(e);
    } finally {
      saving = false;
    }
  }, 450);
}

export async function flushStore() {
  if (!cache) return;
  clearTimeout(persistTimer);
  saving = true;
  try {
    await persistStoreToSupabase(cache);
    bootError = null;
  } finally {
    saving = false;
  }
}

export function isStoreReady() {
  return ready;
}

export function getStoreBootstrapError() {
  return bootError;
}

export function isStoreSaving() {
  return saving;
}

export function subscribeStoreUpdates(onUpdate) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel("alvin-desk-db")
    .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, async () => {
      try {
        const fresh = await loadStoreFromSupabase();
        cache = prepare(fresh);
        onUpdate(cache);
      } catch (e) {
        console.warn("Realtime reload failed", e);
      }
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export { supabase };
