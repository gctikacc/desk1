/**
 * Enterprise store normalization, payroll, attendance, audit (localStorage-backed)
 */

import { migrateAdvanceStore, processPayrollAdvanceDeductions, syncLegacyAdvanceRequests } from "../advanceWorkflow.jsx";
import { applySalarySchedules } from "./vvipCore.js";

const uid = () => Math.random().toString(36).slice(2, 10);
export const todayStr = () => new Date().toISOString().split("T")[0];
export const monthStr = (d = new Date()) => d.toISOString().slice(0, 7);

export const DEFAULT_RBAC = {
  super_admin: { modules: ["*"], actions: ["*"] },
  admin: {
    modules: ["dashboard", "staff", "attendance", "salary", "leaves", "calendar", "reports", "announcements", "alerts", "audit", "settings"],
    actions: ["*"],
  },
  hr: {
    modules: ["dashboard", "staff", "attendance", "leaves", "calendar", "reports", "announcements", "alerts"],
    actions: ["view", "create", "edit", "approve", "review", "export", "broadcast"],
  },
  finance: {
    modules: ["dashboard", "salary", "reports", "alerts"],
    actions: ["view", "approve", "export", "payroll_process", "payroll_lock", "advance_approve"],
  },
  manager: {
    modules: ["dashboard", "staff", "attendance", "leaves", "calendar", "reports", "announcements", "alerts"],
    actions: ["view", "create", "edit", "approve", "review", "export"],
  },
  staff: {
    modules: ["dashboard", "calendar", "requests"],
    actions: ["view_own", "submit", "confirm"],
  },
};

export const resolveEnterpriseRole = (user) => {
  if (!user) return "staff";
  if (user.role === "admin") return "super_admin";
  if (user.role === "manager") {
    if (user.managerPerms?.canApproveAdvanceFinance) return "finance";
    return "hr";
  }
  return "staff";
};

export const canEnterprisePerm = (user, action, module, store) => {
  const rbac = store?.settings?.rbac || DEFAULT_RBAC;
  const roleKey = resolveEnterpriseRole(user);
  const role = rbac[roleKey] || rbac.staff;
  if (roleKey === "super_admin" || role.actions?.includes("*")) return true;
  if (module && role.modules && !role.modules.includes("*") && !role.modules.includes(module)) return false;
  if (role.actions?.includes(action)) return true;
  if (user.role === "manager" && user.managerPerms) {
    const map = {
      approve: user.managerPerms.canApproveLeave,
      export: user.managerPerms.canViewReports,
      edit: user.managerPerms.canEditAttendance,
      review: user.managerPerms.canReviewAdvance,
      advance_approve: user.managerPerms.canApproveAdvanceFinance,
      view_salary: user.managerPerms.canViewSalary,
      add_staff: user.managerPerms.canAddStaff,
      delete_staff: user.managerPerms.canDeleteStaff,
      broadcast: user.managerPerms.canBroadcast,
      audit: user.managerPerms.canViewAudit,
    };
    if (map[action] !== undefined) return !!map[action];
  }
  return false;
};

export const pushEnterpriseAudit = (s, entry) => {
  if (!s.enterpriseAuditLogs) s.enterpriseAuditLogs = [];
  const row = {
    id: uid(),
    module: entry.module || "system",
    entityType: entry.entityType || "record",
    entityId: entry.entityId || null,
    action: entry.action,
    field: entry.field || null,
    oldValue: entry.oldValue == null ? null : String(entry.oldValue),
    newValue: entry.newValue == null ? null : String(entry.newValue),
    changedBy: entry.changedBy,
    role: entry.role || "system",
    ip: entry.ip || "127.0.0.1",
    device: entry.device || (typeof navigator !== "undefined" ? navigator.userAgent?.slice(0, 120) : "server"),
    ts: new Date().toISOString(),
    immutable: true,
  };
  s.enterpriseAuditLogs.unshift(row);
  if (s.enterpriseAuditLogs.length > 2000) s.enterpriseAuditLogs = s.enterpriseAuditLogs.slice(0, 2000);
  s.auditLog = s.auditLog || [];
  s.auditLog.unshift({
    id: row.id,
    userId: row.changedBy,
    action: `${row.module}:${row.action}`,
    detail: row.field ? `${row.field}: ${row.oldValue} → ${row.newValue}` : row.action,
    ts: row.ts,
    ip: row.ip,
  });
  if (s.auditLog.length > 500) s.auditLog = s.auditLog.slice(0, 500);
  pruneAuditLog(s);
  return row;
};

/** Keep audit active for N days; older entries move to archive or delete */
export const pruneAuditLog = (s) => {
  const days = Number(s.settings?.auditRetentionDays) || 7;
  const policy = s.settings?.auditArchivePolicy || "archive";
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();
  if (!Array.isArray(s.auditArchive)) s.auditArchive = [];
  const keep = [];
  const old = [];
  (s.auditLog || []).forEach((row) => {
    if ((row.ts || "") >= cutoffIso) keep.push(row);
    else old.push(row);
  });
  if (old.length) {
    if (policy === "delete") {
      /* dropped */
    } else {
      s.auditArchive = [...old, ...s.auditArchive].slice(0, 2000);
    }
  }
  s.auditLog = keep;
};

export const getRepeatOffenders = (store, windowDays = 30) => {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceStr = since.toISOString().split("T")[0];
  const staff = (store.users || []).filter((u) => u.active && u.role !== "admin");
  const today = todayStr();
  return staff
    .map((u) => {
      const att = (store.attendance || []).filter((a) => a.userId === u.id && a.date >= sinceStr && a.date <= today);
      const lateCount = att.filter((a) => a.late).length;
      const absentCount = att.filter((a) => a.awol || a.status === "absent").length;
      const onLeave = new Set();
      (store.leaves || [])
        .filter((l) => l.userId === u.id && l.status === "approved")
        .forEach((l) => (l.dates || []).filter((d) => d >= sinceStr).forEach((d) => onLeave.add(d)));
      const unexplainedAbsent = att.filter((a) => a.awol).length;
      return { user: u, lateCount, absentCount: unexplainedAbsent || absentCount, score: lateCount * 2 + unexplainedAbsent * 3 };
    })
    .filter((x) => x.lateCount >= 2 || x.absentCount >= 2)
    .sort((a, b) => b.score - a.score);
};

export const getBlockingAdminIssues = (store) => {
  const issues = [];
  const today = todayStr();
  (store.leaves || [])
    .filter((l) => l.status === "pending")
    .forEach((l) => {
      const u = store.users.find((x) => x.id === l.userId);
      issues.push({ id: `leave-${l.id}`, type: "leave", severity: "high", msg: `Pending leave: ${u?.name || l.userId}`, actionPage: "leaves" });
    });
  (store.alerts || [])
    .filter((a) => !a.resolved)
    .forEach((a) => {
      const u = store.users.find((x) => x.id === a.userId);
      issues.push({ id: `alert-${a.id}`, type: "alert", severity: "high", msg: a.msg || `${u?.name}: ${a.type}`, actionPage: "alerts" });
    });
  (store.corrections || [])
    .filter((c) => c.status === "pending")
    .forEach((c) => {
      const u = store.users.find((x) => x.id === c.userId);
      issues.push({ id: `corr-${c.id}`, type: "correction", severity: "medium", msg: `Attendance correction: ${u?.name}`, actionPage: "attendance" });
    });
  const staff = (store.users || []).filter((u) => u.active && u.role !== "admin");
  const todayAtt = (store.attendance || []).filter((a) => a.date === today);
  const presentIds = new Set(todayAtt.filter((a) => a.status === "present" || a.inTime).map((a) => a.userId));
  const onLeave = new Set();
  (store.leaves || [])
    .filter((l) => l.status === "approved" && (l.dates || []).includes(today))
    .forEach((l) => onLeave.add(l.userId));
  staff.forEach((u) => {
    if (!presentIds.has(u.id) && !onLeave.has(u.id)) {
      const hasAlert = (store.alerts || []).some((a) => a.userId === u.id && a.date === today && !a.resolved);
      if (!hasAlert) {
        issues.push({ id: `absent-${u.id}`, type: "attendance", severity: "high", msg: `No punch today: ${u.name}`, actionPage: "attendance", userId: u.id });
      }
    }
  });
  return issues;
};

export const sendAbsentWarning = (s, { userId, date, actorId }) => {
  const u = s.users.find((x) => x.id === userId);
  if (!u) return;
  s.notifications = s.notifications || [];
  s.notifications.push({
    id: uid(),
    userId,
    type: "warning",
    msg: `Attendance warning: you were marked absent on ${date}. Please contact HR if this is incorrect.`,
    read: false,
    date,
  });
  s.alerts = s.alerts || [];
  if (!s.alerts.find((a) => a.userId === userId && a.date === date && a.type === "absent_warning")) {
    s.alerts.push({
      id: uid(),
      userId,
      type: "absent_warning",
      msg: `Warning sent to ${u.name} for absence on ${date}`,
      date,
      resolved: true,
      resolvedAt: new Date().toISOString(),
    });
  }
  pushEnterpriseAudit(s, {
    module: "attendance",
    action: "absent_warning",
    changedBy: actorId,
    role: "admin",
    entityId: userId,
    field: "date",
    newValue: date,
  });
};

const feetToM = (ft) => (Number(ft) || 150) * 0.3048;

export const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getOfficeLocations = (store) => {
  const s = store.settings || {};
  const list = store.officeLocations || [];
  if (list.length) return list.filter((o) => o.active !== false);
  return [
    {
      id: "hq",
      name: "Head Office",
      lat: s.locationLat || 24.8607,
      lng: s.locationLng || 67.0011,
      radiusMeters: feetToM(s.locationRadiusFeet || 150),
      deptIds: [],
      shiftIds: [],
      active: true,
    },
  ];
};

export const validateGeofence = (store, user, lat, lng, accuracy) => {
  const settings = store.settings || {};
  if (!settings.locationRestriction || user.locationExempt) {
    return { ok: true, within: true, distance: 0, office: null, mode: "exempt" };
  }
  const grace = Number(settings.locationGraceMeters) || 15;
  const offices = getOfficeLocations(store).filter((o) => {
    if (o.deptIds?.length && !(user.deptIds || []).some((d) => o.deptIds.includes(d))) return false;
    if (o.shiftIds?.length && !o.shiftIds.includes(user.shiftId)) return false;
    return true;
  });
  if (accuracy && accuracy > 200) {
    return { ok: settings.weakGpsMode !== "block", within: false, distance: null, office: null, mode: "weak_gps", warning: "GPS accuracy is weak" };
  }
  let best = { distance: Infinity, office: null };
  offices.forEach((o) => {
    const d = haversineMeters(lat, lng, o.lat, o.lng);
    if (d < best.distance) best = { distance: d, office: o };
  });
  const limit = (best.office?.radiusMeters || feetToM(settings.locationRadiusFeet)) + grace;
  const within = best.distance <= limit;
  const mode = settings.locationMode || "block";
  return {
    ok: within || mode === "warn",
    within,
    distance: Math.round(best.distance),
    office: best.office,
    mode: within ? "inside" : mode === "warn" ? "warn_outside" : "blocked",
    warning: within ? null : `Outside allowed radius (${Math.round(best.distance)}m / ${Math.round(limit)}m)`,
  };
};

export const getDeviceMeta = () => ({
  ip: "127.0.0.1",
  device: typeof navigator !== "undefined" ? `${navigator.platform} · ${navigator.userAgent?.slice(0, 80)}` : "unknown",
});

export const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });

const calcTotal = (sal) => (sal?.basic || 0) + (sal?.hra || 0) + (sal?.transport || 0) + (sal?.medical || 0);

const shiftForUser = (store, user) => {
  const deptShift = store.deptShifts?.[user.deptIds?.[0]];
  const shId = deptShift || user.shiftId;
  return user.shiftOverride || store.shifts?.find((s) => s.id === shId) || { start: "09:00", end: "17:00", hoursPerDay: 8, graceMinutes: 10 };
};

const minutesFromMidnight = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const computeLateMinutes = (store, user, inTime) => {
  const sh = shiftForUser(store, user);
  const grace = sh.graceMinutes ?? store.settings?.gracePeriodMinutes ?? 10;
  const start = minutesFromMidnight(sh.start);
  const actual = minutesFromMidnight(inTime);
  const late = actual - start - grace;
  return late > 0 ? late : 0;
};

export const markAttendancePunch = (s, { user, type, geo, actor }) => {
  const today = todayStr();
  const att = s.attendance.find((a) => a.userId === user.id && a.date === today);
  const meta = getDeviceMeta();
  if (!s.locationPunches) s.locationPunches = [];
  const punch = {
    id: uid(),
    userId: user.id,
    date: today,
    type,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    accuracy: geo?.accuracy ?? null,
    distanceMeters: geo?.distance ?? null,
    officeId: geo?.office?.id ?? null,
    withinFence: geo?.within ?? null,
    ip: meta.ip,
    device: meta.device,
    ts: new Date().toISOString(),
    deletedAt: null,
  };
  s.locationPunches.push(punch);
  if (type === "in") {
    if (att?.inTime) return { ok: false, error: "Already checked in today" };
    const inTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
    const lateMin = computeLateMinutes(s, user, inTime);
    if (att) {
      att.inTime = inTime;
      att.status = "present";
      att.late = lateMin > (s.settings?.lateThresholdMinutes || 15);
      att.lateMinutes = lateMin;
    } else {
      s.attendance.push({
        id: uid(),
        userId: user.id,
        date: today,
        inTime,
        outTime: null,
        status: "present",
        late: lateMin > (s.settings?.lateThresholdMinutes || 15),
        halfDay: false,
        overtime: 0,
        awol: false,
        lateMinutes: lateMin,
        locationIn: { lat: punch.lat, lng: punch.lng, within: punch.withinFence },
      });
    }
  } else {
    if (!att?.inTime) return { ok: false, error: "Check in first" };
    if (att.outTime) return { ok: false, error: "Already checked out" };
    att.outTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
    att.locationOut = { lat: punch.lat, lng: punch.lng, within: punch.withinFence };
  }
  pushEnterpriseAudit(s, {
    module: "attendance",
    entityType: "attendance",
    entityId: att?.id || punch.id,
    action: type === "in" ? "check_in" : "check_out",
    changedBy: actor?.id || user.id,
    role: resolveEnterpriseRole(actor || user),
    ip: meta.ip,
    device: meta.device,
    field: "location",
    newValue: `${punch.lat},${punch.lng}`,
  });
  return { ok: true, punch };
};

export const runSmartValidations = (store) => {
  const warnings = [];
  const month = monthStr();
  (store.payrollRuns || []).filter((r) => r.month === month && !r.deletedAt).forEach((r) => {
    if (r.status === "locked") warnings.push({ type: "payroll_locked", msg: `Payroll for ${month} is locked`, severity: "info" });
  });
  const advPending = (store.advanceSalaryRequests || []).filter((a) => !a.deletedAt && a.status === "waiting_staff_confirmation");
  if (advPending.length) warnings.push({ type: "advance_pending", msg: `${advPending.length} advance(s) awaiting staff confirmation`, severity: "orange" });
  (store.users || []).filter((u) => u.active && u.role !== "admin").forEach((u) => {
    const today = todayStr();
    const dup = (store.attendance || []).filter((a) => a.userId === u.id && a.date === today && a.inTime);
    if (dup.length > 1) warnings.push({ type: "duplicate_punch", msg: `Duplicate attendance for ${u.name} today`, severity: "red" });
    const gross = calcTotal(u.salary);
    if (gross > 0 && gross < 15000) warnings.push({ type: "low_salary", msg: `Abnormally low salary for ${u.name}`, severity: "orange" });
  });
  (store.leaves || []).filter((l) => l.status === "pending").forEach((l) => {
    const dup = (store.leaves || []).filter((x) => x.userId === l.userId && x.status === "pending" && x.id !== l.id);
    if (dup.length) warnings.push({ type: "duplicate_leave", msg: `Duplicate pending leave for user ${l.userId}`, severity: "orange" });
  });
  return warnings;
};

export const buildPayslip = (store, user, month, payrollRunId, overrides = null) => {
  const gross = calcTotal(user.salary);
  const att = (store.attendance || []).filter((a) => a.userId === user.id && a.date.startsWith(month));
  const lvs = (store.leaves || []).filter((l) => l.userId === user.id && l.status === "approved");
  const leaveDays = lvs.reduce((s, l) => s + (l.dates || []).filter((d) => d.startsWith(month)).length, 0);
  const present = att.filter((a) => !a.awol && (a.status === "present" || a.inTime)).length;
  const half = att.filter((a) => a.halfDay).length;
  const lateCount = att.filter((a) => a.late).length;
  const lateMin = att.reduce((s, a) => s + (a.lateMinutes || (a.late ? store.settings?.lateThresholdMinutes || 15 : 0)), 0);
  const ot = att.reduce((s, a) => s + (a.overtime || 0), 0);
  const awol = att.filter((a) => a.awol).length;
  const workDays = 26;
  const perDay = gross / workDays || 0;
  const hoursPerDay = 8;
  const otPay = (gross / workDays / hoursPerDay) * (ot / 60);
  const lateDeduct = (lateMin / 60) * (perDay / hoursPerDay);
  const unpaidLeave = Math.max(0, awol);
  const leaveDeduct = unpaidLeave * perDay;
  const taxPct = Number(store.settings?.taxPercent) || 0;
  const bonus = Number(user.monthlyBonus) || 0;
  const advDeduct = user.advance?.active ? (user.advance.monthly || 0) + (user.advance.overflow || 0) : 0;
  const manual = store.settings?.payrollManualEdit && overrides;
  const earnedBase = (present + leaveDays - half * 0.5) * perDay + otPay + bonus;
  const earned = manual?.gross != null ? Number(overrides.gross) : earnedBase;
  const tax = manual?.deductions?.tax != null ? Number(overrides.deductions.tax) : Math.round((earned * taxPct) / 100);
  const lateDed = manual?.deductions?.late != null ? Number(overrides.deductions.late) : Math.round(lateDeduct);
  const leaveDed = manual?.deductions?.leave != null ? Number(overrides.deductions.leave) : Math.round(leaveDeduct);
  const advDed = manual?.deductions?.advance != null ? Number(overrides.deductions.advance) : advDeduct;
  const net = manual?.net != null ? Number(overrides.net) : Math.max(0, Math.round(earned - lateDed - leaveDed - advDed - tax));
  return {
    id: uid(),
    payrollRunId,
    userId: user.id,
    month,
    earnings: {
      basic: user.salary?.basic || 0,
      hra: user.salary?.hra || 0,
      transport: user.salary?.transport || 0,
      medical: user.salary?.medical || 0,
      salary: Math.round((present + leaveDays - half * 0.5) * perDay),
      bonus,
      overtime: Math.round(otPay),
    },
    deductions: { tax, advance: advDed, late: lateDed, leave: leaveDed, other: 0 },
    attendanceSummary: { present, leave: leaveDays, half, late: lateCount, lateMin, overtime: ot, awol, workDays },
    gross: Math.round(earned),
    net,
    status: "generated",
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
};

export const processPayrollRun = (s, { month, actor, lock = false }) => {
  if (!s.payrollRuns) s.payrollRuns = [];
  if (!s.payslips) s.payslips = [];
  const existing = s.payrollRuns.find((r) => r.month === month && !r.deletedAt && r.status === "locked");
  if (existing) return { ok: false, error: "Payroll already locked for this month" };
  const dup = s.payrollRuns.find((r) => r.month === month && !r.deletedAt && r.status !== "rejected");
  let run = dup;
  if (!run) {
    run = { id: uid(), month, status: "draft", processedAt: null, processedBy: null, lockedAt: null, deletedAt: null };
    s.payrollRuns.push(run);
  }
  const staff = s.users.filter((u) => u.active && u.role !== "admin" && u.employmentType !== "intern");
  s.payslips = s.payslips.filter((p) => p.month !== month || p.deletedAt);
  staff.forEach((u) => {
    const slip = buildPayslip(s, u, month, run.id);
    s.payslips.push(slip);
  });
  run.status = lock ? "locked" : "approved";
  run.processedAt = new Date().toISOString();
  run.processedBy = actor?.id;
  if (lock) run.lockedAt = run.processedAt;
  pushEnterpriseAudit(s, {
    module: "payroll",
    entityType: "payroll_run",
    entityId: run.id,
    action: lock ? "lock" : "process",
    changedBy: actor?.id || "system",
    role: resolveEnterpriseRole(actor),
    field: "month",
    newValue: month,
  });
  return { ok: true, run, count: staff.length };
};

export const normalizeEnterpriseStore = (data) => {
  if (!data.settings) data.settings = {};
  if (!data.settings.rbac) data.settings.rbac = DEFAULT_RBAC;
  if (!data.settings.locationMode) data.settings.locationMode = "block";
  if (!data.settings.locationGraceMeters) data.settings.locationGraceMeters = 15;
  if (!data.settings.weakGpsMode) data.settings.weakGpsMode = "warn";
  if (!data.settings.taxPercent) data.settings.taxPercent = 0;
  if (data.settings.auditRetentionDays == null) data.settings.auditRetentionDays = 7;
  if (!data.settings.auditArchivePolicy) data.settings.auditArchivePolicy = "archive";
  if (data.settings.payrollManualEdit == null) data.settings.payrollManualEdit = false;
  if (data.settings.locationRadiusMeters == null) {
    data.settings.locationRadiusMeters = Math.round((Number(data.settings.locationRadiusFeet) || 150) * 0.3048);
  }
  if (!data.settings.allowAdvanceInstallments) data.settings.allowAdvanceInstallments = true;
  if (!Array.isArray(data.auditArchive)) data.auditArchive = [];
  if (!data.settings.companyId) data.settings.companyId = "co1";
  if (!data.settings.branchId) data.settings.branchId = "br1";
  if (!Array.isArray(data.officeLocations)) data.officeLocations = [];
  if (!Array.isArray(data.locationPunches)) data.locationPunches = [];
  if (!Array.isArray(data.payrollRuns)) data.payrollRuns = [];
  if (!Array.isArray(data.payslips)) data.payslips = [];
  if (!Array.isArray(data.enterpriseAuditLogs)) data.enterpriseAuditLogs = [];
  if (!Array.isArray(data.loginActivity)) data.loginActivity = [];
  data.shifts = (data.shifts || []).map((sh) => ({
    ...sh,
    graceMinutes: sh.graceMinutes ?? data.settings.gracePeriodMinutes ?? 10,
    breakMinutes: sh.breakMinutes ?? 60,
    overtimeMultiplier: sh.overtimeMultiplier ?? 1.5,
  }));
  migrateAdvanceStore(data);
  processPayrollAdvanceDeductions(data);
  syncLegacyAdvanceRequests(data);
  if (!Array.isArray(data.salarySchedules)) data.salarySchedules = [];
  applySalarySchedules(data);
  pruneAuditLog(data);
  data._validationWarnings = runSmartValidations(data);
  return data;
};

export const softDelete = (record) => {
  record.deletedAt = new Date().toISOString();
  return record;
};
