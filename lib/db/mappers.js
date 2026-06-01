import { DEFAULT_ORG_ID } from "../supabase/client.js";
import { DEFAULT_PANEL_VISIBILITY } from "../vvipCore.js";

export const ORG_ID = DEFAULT_ORG_ID;

const mapShift = (r) => ({
  id: r.id,
  name: r.name,
  start: r.start_time,
  end: r.end_time,
  color: r.color,
  hoursPerDay: Number(r.hours_per_day) || 8,
  graceMinutes: r.grace_minutes,
  breakMinutes: r.break_minutes,
  overtimeMultiplier: r.overtime_multiplier,
});

const mapDept = (r) => ({ id: r.id, name: r.name, color: r.color });

const mapLeaveType = (r) => ({ id: r.id, name: r.name, limit: r.annual_limit, color: r.color });

const mapProfileToUser = (p, salary, deptIds, emergencyContacts) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role,
  initials: p.initials || p.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
  phone: p.phone || "",
  employmentType: p.employment_type || "full-time",
  deptIds: deptIds || [],
  shiftId: p.shift_id || "s1",
  shiftOverride: p.shift_override || null,
  joiningDate: p.joining_date || "",
  dob: p.dob || "",
  emergencyContact: emergencyContacts?.[0] || { name: "", phone: "" },
  emergencyContacts: emergencyContacts || [],
  locationExempt: !!p.location_exempt,
  active: p.active !== false,
  salary: salary || { basic: 0, hra: 0, transport: 0, medical: 0 },
  monthlyBonus: Number(p.monthly_bonus) || 0,
  managerPerms: p.manager_perms || null,
  managerModules: p.manager_modules || null,
  panelVisibility: { ...DEFAULT_PANEL_VISIBILITY, ...(p.panel_visibility || {}) },
  advance: p.advance_balance || { active: false, total: 0, remaining: 0, monthly: 0, overflow: 0 },
  tourDone: !!p.tour_done,
});

export const mapAttendance = (r) => ({
  id: r.id,
  userId: r.user_id,
  date: r.att_date,
  inTime: r.in_time,
  outTime: r.out_time,
  status: r.status,
  late: r.late,
  lateMinutes: r.late_minutes || 0,
  halfDay: r.half_day,
  overtime: r.overtime || 0,
  awol: r.awol,
  corrected: r.corrected,
  locationIn: r.location_in,
  locationOut: r.location_out,
});

export const mapLeave = (r) => ({
  id: r.id,
  userId: r.user_id,
  leaveTypeId: r.leave_type_id,
  dateFrom: r.date_from,
  dateTo: r.date_to,
  dates: r.dates || [],
  reason: r.reason,
  status: r.status,
  appliedOn: r.applied_on,
  approvedBy: r.approved_by,
});

export const buildStoreFromRows = (rows) => {
  const deptShifts = {};
  (rows.departmentShifts || []).forEach((r) => {
    deptShifts[r.department_id] = r.shift_id;
  });

  const salaries = {};
  (rows.salaries || []).forEach((s) => {
    salaries[s.profile_id] = {
      basic: Number(s.basic) || 0,
      hra: Number(s.hra) || 0,
      transport: Number(s.transport) || 0,
      medical: Number(s.medical) || 0,
    };
  });

  const deptIdsByProfile = {};
  (rows.profileDepartments || []).forEach((r) => {
    if (!deptIdsByProfile[r.profile_id]) deptIdsByProfile[r.profile_id] = [];
    deptIdsByProfile[r.profile_id].push(r.department_id);
  });

  const ecsByProfile = {};
  (rows.emergencyContacts || []).forEach((c) => {
    if (!ecsByProfile[c.profile_id]) ecsByProfile[c.profile_id] = [];
    ecsByProfile[c.profile_id].push({ name: c.name, relation: c.relation, phone: c.phone });
  });

  const users = (rows.profiles || []).map((p) =>
    mapProfileToUser(p, salaries[p.id], deptIdsByProfile[p.id], ecsByProfile[p.id])
  );

  return {
    settings: rows.settings?.settings || {},
    leaveTypes: (rows.leaveTypes || []).map(mapLeaveType),
    departments: (rows.departments || []).map(mapDept),
    shifts: (rows.shifts || []).map(mapShift),
    deptShifts,
    users,
    attendance: (rows.attendance || []).map(mapAttendance),
    leaves: (rows.leaves || []).map(mapLeave),
    offDays: (rows.offDays || []).map((o) => ({
      id: o.id,
      date: o.off_date,
      name: o.name,
      scope: o.scope,
      userIds: o.user_ids || [],
      deptIds: o.dept_ids || [],
      shiftIds: o.shift_ids || [],
    })),
    resolvedHolidays: (rows.resolvedHolidays || []).map((h) => h.holiday_date),
    corrections: (rows.corrections || []).map((c) => ({
      id: c.id,
      userId: c.user_id,
      date: c.corr_date,
      reqIn: c.req_in,
      reqOut: c.req_out,
      reason: c.reason,
      status: c.status,
      appliedOn: c.applied_on,
    })),
    advanceSalaryRequests: (rows.advanceRequests || []).map((a) => ({
      id: a.id,
      userId: a.user_id,
      status: a.status,
      requestedAmount: Number(a.requested_amount),
      approvedAmount: a.approved_amount != null ? Number(a.approved_amount) : null,
      monthlyDeduction: Number(a.monthly_deduction) || 0,
      installmentsCount: a.installments_count || 1,
      deductionStartDate: a.deduction_start_date,
      reason: a.reason,
      termsNotes: a.terms_notes,
      requestType: a.request_type,
      overflow: Number(a.overflow) || 0,
      remainingBalance: Number(a.remaining_balance) || 0,
      appliedOn: a.applied_on,
      updatedAt: a.updated_at,
      deletedAt: a.deleted_at,
      staffConfirmedAt: a.staff_confirmed_at,
    })),
    advanceInstallments: (rows.advanceInstallments || []).map((i) => ({
      id: i.id,
      requestId: i.request_id,
      sequence: i.sequence_num,
      dueMonth: i.due_month,
      amount: Number(i.amount),
      status: i.status,
      paidAt: i.paid_at,
      paidAmount: Number(i.paid_amount) || 0,
      deletedAt: i.deleted_at,
    })),
    advanceApprovals: (rows.advanceApprovals || []).map((a) => ({
      id: a.id,
      requestId: a.request_id,
      step: a.step,
      action: a.action,
      byUserId: a.by_user_id,
      role: a.role,
      note: a.note,
      ts: a.approved_at,
    })),
    advanceAuditLogs: (rows.advanceAuditLogs || []).map((a) => ({
      id: a.id,
      requestId: a.request_id,
      entityType: a.entity_type,
      field: a.field,
      oldValue: a.old_value,
      newValue: a.new_value,
      action: a.action,
      changedBy: a.changed_by,
      role: a.role,
      ip: a.ip,
      ts: a.logged_at,
      immutable: a.immutable,
    })),
    advanceRequests: [],
    salaryHistory: (rows.salaryHistory || []).map((h) => ({
      id: h.id,
      userId: h.user_id,
      date: h.rev_date,
      old: h.old_salary,
      newS: h.new_salary,
      by: h.revised_by,
      note: h.note,
    })),
    salarySchedules: (rows.salarySchedules || []).map((s) => ({
      id: s.id,
      userId: s.user_id,
      newSalary: s.new_salary,
      effectiveAt: s.effective_at,
      note: s.note,
      createdBy: s.created_by,
      applied: s.applied,
      appliedAt: s.applied_at,
      deletedAt: s.deleted_at,
    })),
    notifications: (rows.notifications || []).map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      msg: n.msg,
      read: n.read,
      date: n.notif_date,
      requestId: n.request_id,
    })),
    alerts: (rows.alerts || []).map((a) => ({
      id: a.id,
      userId: a.user_id,
      type: a.alert_type,
      msg: a.msg,
      date: a.alert_date,
      resolved: a.resolved,
      resolvedAt: a.resolved_at,
      action: a.action,
    })),
    announcements: (rows.announcements || []).map((a) => ({
      id: a.id,
      title: a.title,
      msg: a.msg,
      by: a.created_by,
      date: a.ann_date,
      targetType: a.target_type,
      targetDeptIds: a.target_dept_ids || [],
      seenBy: a.seen_by || [],
    })),
    auditLog: (rows.auditLog || []).map((a) => ({
      id: a.id,
      userId: a.user_id,
      action: a.action,
      detail: a.detail,
      ts: a.logged_at,
      ip: a.ip,
    })),
    auditArchive: (rows.auditArchive || []).map((a) => ({
      id: a.id,
      userId: a.user_id,
      action: a.action,
      detail: a.detail,
      ts: a.logged_at,
      ip: a.ip,
    })),
    enterpriseAuditLogs: (rows.enterpriseAuditLogs || []).map((a) => ({
      id: a.id,
      module: a.module,
      entityType: a.entity_type,
      entityId: a.entity_id,
      action: a.action,
      field: a.field,
      oldValue: a.old_value,
      newValue: a.new_value,
      changedBy: a.changed_by,
      role: a.role,
      ip: a.ip,
      device: a.device,
      ts: a.logged_at,
      immutable: a.immutable,
    })),
    exportHistory: [],
    passwordResets: (rows.passwordResets || []).map((p) => ({
      id: p.id,
      userId: p.user_id,
      by: p.reset_by,
      ts: p.reset_at,
    })),
    historyRequests: (rows.historyRequests || []).map((h) => ({
      id: h.id,
      userId: h.user_id,
      dateFrom: h.date_from,
      reason: h.reason,
      status: h.status,
      appliedOn: h.applied_on,
    })),
    officeLocations: (rows.officeLocations || []).map((o) => ({
      id: o.id,
      name: o.name,
      lat: Number(o.lat),
      lng: Number(o.lng),
      radiusMeters: Number(o.radius_meters),
      deptIds: o.dept_ids || [],
      shiftIds: o.shift_ids || [],
      active: o.active !== false,
    })),
    locationPunches: (rows.locationPunches || []).map((p) => ({
      id: p.id,
      userId: p.user_id,
      date: p.punch_date,
      type: p.punch_type,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      distanceMeters: p.distance_meters,
      officeId: p.office_id,
      withinFence: p.within_fence,
      ip: p.ip,
      device: p.device,
      ts: p.punched_at,
      deletedAt: p.deleted_at,
    })),
    payrollRuns: (rows.payrollRuns || []).map((r) => ({
      id: r.id,
      month: r.month,
      status: r.status,
      processedAt: r.processed_at,
      processedBy: r.processed_by,
      lockedAt: r.locked_at,
      deletedAt: r.deleted_at,
    })),
    payslips: (rows.payslips || []).map((p) => ({
      id: p.id,
      payrollRunId: p.payroll_run_id,
      userId: p.user_id,
      month: p.month,
      earnings: p.earnings,
      deductions: p.deductions,
      attendanceSummary: p.attendance_summary,
      gross: Number(p.gross),
      net: Number(p.net),
      status: p.status,
      deletedAt: p.deleted_at,
      createdAt: p.created_at,
    })),
    loginActivity: (rows.loginActivity || []).map((l) => ({
      id: l.id,
      userId: l.user_id,
      email: l.email,
      role: l.role,
      ts: l.logged_at,
      ip: l.ip,
      device: l.device,
    })),
  };
};
