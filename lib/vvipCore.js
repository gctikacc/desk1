/**
 * VVIP — shared salary calc, navigation targets, pending actions, schedules
 */

import { pendingAdvanceCount, ADV_STATUS } from "../advanceWorkflow.jsx";

export const DEFAULT_PANEL_VISIBILITY = {
  salary: false,
  overtime: false,
  leaveBalance: false,
  salaryCalc: false,
  lateDeduction: false,
};

export const DEFAULT_MANAGER_MODULES = {
  dashboard: true,
  staff: true,
  attendance: true,
  salary: false,
  leaves: true,
  calendar: true,
  reports: true,
  announcements: true,
  alerts: true,
  audit: false,
  settings: false,
};

export const calcTotal = (sal) =>
  (sal?.basic || 0) + (sal?.hra || 0) + (sal?.transport || 0) + (sal?.medical || 0);

export const calcShiftHours = (start, end) => {
  if (!start || !end) return 8;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
};

const leaveDatesOf = (l) => {
  if (l.dates?.length) return l.dates;
  if (l.dateFrom && l.dateTo) {
    const dates = [];
    const cur = new Date(l.dateFrom);
    const end = new Date(l.dateTo);
    while (cur <= end) {
      dates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }
  return l.dateFrom ? [l.dateFrom] : [];
};

export const getYearlyAbsenceCount = (store, userId, year = new Date().getFullYear()) => {
  const y = String(year);
  const leaves = new Set();
  (store.leaves || [])
    .filter((l) => l.userId === userId && l.status === "approved")
    .forEach((l) => leaveDatesOf(l).filter((d) => d.startsWith(y)).forEach((d) => leaves.add(d)));
  const att = (store.attendance || []).filter((a) => a.userId === userId && a.date.startsWith(y));
  const awol = att.filter((a) => a.awol || a.status === "absent").length;
  const unexplained = att.filter((a) => !a.inTime && !leaves.has(a.date)).length;
  return { awol, unexplained, total: awol + unexplained, approvedLeaveDays: leaves.size };
};

/** Backend-verified monthly salary breakdown (UI display mode separate) */
export const calcStaffSalary = (store, user, month = new Date().toISOString().slice(0, 7)) => {
  const gross = calcTotal(user.salary);
  if (!gross || user.employmentType === "intern") {
    return { gross: 0, net: 0, present: 0, leaveDays: 0, ot: 0, otPay: 0, lateMin: 0, lateDeduct: 0, advDeduct: 0, perDay: 0, workDays: 26, half: 0, awol: 0 };
  }
  const att = (store.attendance || []).filter((a) => a.userId === user.id && a.date.startsWith(month));
  const lvs = (store.leaves || []).filter((l) => l.userId === user.id && l.status === "approved");
  const leaveDays = lvs.reduce((s, l) => s + leaveDatesOf(l).filter((d) => d.startsWith(month)).length, 0);
  const present = att.filter((a) => !a.awol && (a.inTime || a.status === "present")).length;
  const half = att.filter((a) => a.halfDay).length;
  const awol = att.filter((a) => a.awol).length;
  const lateMin = att.reduce((s, a) => s + (a.lateMinutes || (a.late ? store.settings?.lateThresholdMinutes || 15 : 0)), 0);
  const ot = att.reduce((s, a) => s + (a.overtime || 0), 0);
  const workDays = 26;
  const perDay = gross / workDays;
  const sh = user.shiftOverride || store.shifts?.find((x) => x.id === user.shiftId) || { hoursPerDay: 8 };
  const hoursPerDay = sh.hoursPerDay || calcShiftHours(sh.start, sh.end) || 8;
  const otPay = (gross / workDays / hoursPerDay) * (ot / 60);
  const lateDeduct = (lateMin / 60) * (perDay / hoursPerDay);
  const absentDeduct = awol * perDay;
  const earned = (present + leaveDays - half * 0.5) * perDay + otPay - absentDeduct;
  const advDeduct = user.advance?.active ? (user.advance.monthly || 0) + (user.advance.overflow || 0) : 0;
  const net = Math.max(0, Math.round(earned - lateDeduct - advDeduct));
  return { gross, net, present, leaveDays, ot, otPay, lateMin, lateDeduct, advDeduct, perDay, workDays, half, awol, hoursPerDay, earned: Math.round(earned) };
};

export const applySalarySchedules = (s) => {
  if (!Array.isArray(s.salarySchedules)) return;
  const now = new Date().toISOString();
  s.salarySchedules.forEach((sch) => {
    if (sch.applied || sch.deletedAt) return;
    if ((sch.effectiveAt || "") <= now) {
      const u = s.users.find((x) => x.id === sch.userId);
      if (u && sch.newSalary) {
        s.salaryHistory = s.salaryHistory || [];
        s.salaryHistory.unshift({
          id: Math.random().toString(36).slice(2, 10),
          userId: u.id,
          date: sch.effectiveAt?.slice(0, 10) || now.slice(0, 10),
          old: { ...u.salary },
          newS: { ...sch.newSalary },
          by: sch.createdBy || "system",
          note: sch.note || "Scheduled increase",
        });
        u.salary = { ...sch.newSalary };
        sch.applied = true;
        sch.appliedAt = now;
      }
    }
  });
};

export const buildPendingActionItems = (store) => {
  const items = [];
  (store.leaves || [])
    .filter((l) => l.status === "pending")
    .forEach((l) => {
      const u = store.users.find((x) => x.id === l.userId);
      items.push({
        id: `leave-${l.id}`,
        type: "leave",
        severity: "high",
        msg: `Pending leave: ${u?.name || l.userId}`,
        page: "leaves",
        tab: "pending",
        targetId: `leave-row-${l.id}`,
        resolve: (s) => {
          s.leaves = s.leaves.map((x) => (x.id === l.id ? { ...x, status: "rejected", approvedBy: "u1" } : x));
        },
      });
    });
  (store.corrections || [])
    .filter((c) => c.status === "pending")
    .forEach((c) => {
      const u = store.users.find((x) => x.id === c.userId);
      items.push({
        id: `corr-${c.id}`,
        type: "correction",
        severity: "medium",
        msg: `Attendance correction: ${u?.name}`,
        page: "attendance",
        tab: "corrections",
        targetId: `corr-row-${c.id}`,
        resolve: (s) => {
          s.corrections = s.corrections.map((x) => (x.id === c.id ? { ...x, status: "rejected" } : x));
        },
      });
    });
  const advN = pendingAdvanceCount(store);
  if (advN > 0) {
    items.push({
      id: "advance-pending",
      type: "advance",
      severity: "high",
      msg: `${advN} advance request(s) need review`,
      page: "salary",
      tab: "advance",
      targetId: "advance-panel",
    });
  }
  (store.alerts || [])
    .filter((a) => !a.resolved)
    .forEach((a) => {
      const u = store.users.find((x) => x.id === a.userId);
      items.push({
        id: `alert-${a.id}`,
        type: "alert",
        severity: "high",
        msg: a.msg || `${u?.name}: ${a.type}`,
        page: "alerts",
        tab: "active",
        targetId: `alert-card-${a.id}`,
        resolve: (s) => {
          s.alerts = s.alerts.map((x) => (x.id === a.id ? { ...x, resolved: true, resolvedAt: new Date().toISOString() } : x));
        },
      });
    });
  return items;
};

export const scrollToTarget = (targetId, delay = 350) => {
  setTimeout(() => {
    const el = document.querySelector(`[data-nav-target="${targetId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("nav-highlight");
    setTimeout(() => el.classList.remove("nav-highlight"), 2800);
  }, delay);
};

export const normalizeEmergencyContacts = (user) => {
  if (Array.isArray(user.emergencyContacts) && user.emergencyContacts.length) return user.emergencyContacts;
  if (user.emergencyContact?.name || user.emergencyContact?.phone) {
    return [{ name: user.emergencyContact.name || "", relation: user.emergencyContact.relation || "", phone: user.emergencyContact.phone || "" }];
  }
  return [{ name: "", relation: "", phone: "" }];
};
