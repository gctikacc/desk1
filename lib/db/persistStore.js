import { supabase } from "../supabase/client.js";
import { ORG_ID } from "./mappers.js";

const upsert = async (table, rows, onConflict) => {
  if (!rows?.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw error;
};

const deleteMissing = async (table, keepIds, idColumn = "id") => {
  const { data, error } = await supabase.from(table).select(idColumn).eq("org_id", ORG_ID);
  if (error) throw error;
  const remove = (data || []).map((r) => r[idColumn]).filter((id) => !keepIds.includes(id));
  if (!remove.length) return;
  const { error: delErr } = await supabase.from(table).delete().eq("org_id", ORG_ID).in(idColumn, remove);
  if (delErr) throw delErr;
};

export async function persistStoreToSupabase(store) {
  if (!supabase) throw new Error("Supabase not configured");

  await supabase.from("org_settings").upsert({
    org_id: ORG_ID,
    settings: store.settings || {},
    updated_at: new Date().toISOString(),
  });

  const departments = (store.departments || []).map((d) => ({
    org_id: ORG_ID,
    id: d.id,
    name: d.name,
    color: d.color,
  }));
  await upsert("departments", departments, "org_id,id");
  await deleteMissing("departments", departments.map((d) => d.id));

  const shifts = (store.shifts || []).map((s) => ({
    org_id: ORG_ID,
    id: s.id,
    name: s.name,
    start_time: s.start,
    end_time: s.end,
    color: s.color,
    hours_per_day: s.hoursPerDay ?? 8,
    grace_minutes: s.graceMinutes,
    break_minutes: s.breakMinutes,
    overtime_multiplier: s.overtimeMultiplier,
  }));
  await upsert("shifts", shifts, "org_id,id");
  await deleteMissing("shifts", shifts.map((s) => s.id));

  const deptShifts = Object.entries(store.deptShifts || {}).map(([department_id, shift_id]) => ({
    org_id: ORG_ID,
    department_id,
    shift_id,
  }));
  await supabase.from("department_shifts").delete().eq("org_id", ORG_ID);
  if (deptShifts.length) await upsert("department_shifts", deptShifts, "org_id,department_id");

  const leaveTypes = (store.leaveTypes || []).map((lt) => ({
    org_id: ORG_ID,
    id: lt.id,
    name: lt.name,
    annual_limit: lt.limit,
    color: lt.color,
  }));
  await upsert("leave_types", leaveTypes, "org_id,id");
  await deleteMissing("leave_types", leaveTypes.map((l) => l.id));

  for (const u of store.users || []) {
    await supabase.from("profiles").upsert({
      id: u.id,
      org_id: ORG_ID,
      email: u.email,
      name: u.name,
      initials: u.initials,
      phone: u.phone,
      role: u.role,
      employment_type: u.employmentType,
      shift_id: u.shiftId,
      shift_override: u.shiftOverride,
      joining_date: u.joiningDate || null,
      dob: u.dob || null,
      location_exempt: !!u.locationExempt,
      active: u.active !== false,
      tour_done: !!u.tourDone,
      manager_perms: u.managerPerms,
      manager_modules: u.managerModules,
      panel_visibility: u.panelVisibility,
      advance_balance: u.advance,
      monthly_bonus: u.monthlyBonus || 0,
      updated_at: new Date().toISOString(),
    });
    await supabase.from("user_salaries").upsert({
      profile_id: u.id,
      basic: u.salary?.basic || 0,
      hra: u.salary?.hra || 0,
      transport: u.salary?.transport || 0,
      medical: u.salary?.medical || 0,
    });
    await supabase.from("profile_departments").delete().eq("profile_id", u.id);
    const pds = (u.deptIds || []).map((department_id) => ({ profile_id: u.id, department_id }));
    if (pds.length) await supabase.from("profile_departments").insert(pds);
    await supabase.from("user_emergency_contacts").delete().eq("profile_id", u.id);
    const ecs = (u.emergencyContacts || []).map((c, i) => ({
      id: `${u.id}-ec-${i}`,
      profile_id: u.id,
      name: c.name || "",
      relation: c.relation || "",
      phone: c.phone || "",
      sort_order: i,
    }));
    if (ecs.length) await upsert("user_emergency_contacts", ecs, "id");
  }

  const attendance = (store.attendance || []).map((a) => ({
    org_id: ORG_ID,
    id: a.id,
    user_id: a.userId,
    att_date: a.date,
    in_time: a.inTime,
    out_time: a.outTime,
    status: a.status,
    late: !!a.late,
    late_minutes: a.lateMinutes || 0,
    half_day: !!a.halfDay,
    overtime: a.overtime || 0,
    awol: !!a.awol,
    corrected: !!a.corrected,
    location_in: a.locationIn,
    location_out: a.locationOut,
  }));
  await upsert("attendance", attendance, "org_id,id");
  await deleteMissing("attendance", attendance.map((a) => a.id));

  const leaves = (store.leaves || []).map((l) => ({
    org_id: ORG_ID,
    id: l.id,
    user_id: l.userId,
    leave_type_id: l.leaveTypeId,
    date_from: l.dateFrom,
    date_to: l.dateTo,
    dates: l.dates || [],
    reason: l.reason,
    status: l.status,
    applied_on: l.appliedOn,
    approved_by: l.approvedBy,
  }));
  await upsert("leaves", leaves, "org_id,id");
  await deleteMissing("leaves", leaves.map((l) => l.id));

  const corrections = (store.corrections || []).map((c) => ({
    org_id: ORG_ID,
    id: c.id,
    user_id: c.userId,
    corr_date: c.date,
    req_in: c.reqIn,
    req_out: c.reqOut,
    reason: c.reason,
    status: c.status,
    applied_on: c.appliedOn,
  }));
  await upsert("corrections", corrections, "org_id,id");
  await deleteMissing("corrections", corrections.map((c) => c.id));

  const offDays = (store.offDays || []).map((o) => ({
    org_id: ORG_ID,
    id: o.id,
    off_date: o.date,
    name: o.name,
    scope: o.scope,
    user_ids: o.userIds || [],
    dept_ids: o.deptIds || [],
    shift_ids: o.shiftIds || [],
  }));
  await upsert("off_days", offDays, "org_id,id");
  await deleteMissing("off_days", offDays.map((o) => o.id));

  await supabase.from("resolved_holidays").delete().eq("org_id", ORG_ID);
  const holidays = (store.resolvedHolidays || []).map((holiday_date) => ({ org_id: ORG_ID, holiday_date }));
  if (holidays.length) await upsert("resolved_holidays", holidays, "org_id,holiday_date");

  const syncTable = async (table, rows, mapper, conflict = "org_id,id") => {
    const mapped = (rows || []).map(mapper);
    await upsert(table, mapped, conflict);
    await deleteMissing(table, mapped.map((r) => r.id));
  };

  await syncTable(
    "advance_salary_requests",
    store.advanceSalaryRequests,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      user_id: a.userId,
      status: a.status,
      requested_amount: a.requestedAmount,
      approved_amount: a.approvedAmount,
      monthly_deduction: a.monthlyDeduction,
      installments_count: a.installmentsCount,
      deduction_start_date: a.deductionStartDate,
      reason: a.reason,
      terms_notes: a.termsNotes,
      request_type: a.requestType,
      overflow: a.overflow,
      remaining_balance: a.remainingBalance,
      applied_on: a.appliedOn,
      updated_at: a.updatedAt || new Date().toISOString(),
      staff_confirmed_at: a.staffConfirmedAt,
      deleted_at: a.deletedAt,
    })
  );

  await syncTable(
    "advance_installments",
    store.advanceInstallments,
    (i) => ({
      org_id: ORG_ID,
      id: i.id,
      request_id: i.requestId,
      sequence_num: i.sequence,
      due_month: i.dueMonth,
      amount: i.amount,
      status: i.status,
      paid_at: i.paidAt,
      paid_amount: i.paidAmount,
      deleted_at: i.deletedAt,
    })
  );

  await syncTable(
    "notifications",
    store.notifications,
    (n) => ({
      org_id: ORG_ID,
      id: n.id,
      user_id: n.userId,
      type: n.type,
      msg: n.msg,
      read: !!n.read,
      notif_date: n.date,
      request_id: n.requestId,
    })
  );

  await syncTable(
    "alerts",
    store.alerts,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      user_id: a.userId,
      alert_type: a.type,
      msg: a.msg,
      alert_date: a.date,
      resolved: !!a.resolved,
      resolved_at: a.resolvedAt,
      action: a.action,
    })
  );

  await syncTable(
    "announcements",
    store.announcements,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      title: a.title,
      msg: a.msg,
      created_by: a.by,
      ann_date: a.date,
      target_type: a.targetType,
      target_dept_ids: a.targetDeptIds || [],
      seen_by: a.seenBy || [],
    })
  );

  await syncTable(
    "audit_log",
    store.auditLog,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      user_id: a.userId,
      action: a.action,
      detail: a.detail,
      logged_at: a.ts,
      ip: a.ip,
    })
  );

  await syncTable(
    "payroll_runs",
    store.payrollRuns,
    (r) => ({
      org_id: ORG_ID,
      id: r.id,
      month: r.month,
      status: r.status,
      processed_at: r.processedAt,
      processed_by: r.processedBy,
      locked_at: r.lockedAt,
      deleted_at: r.deletedAt,
    })
  );

  await syncTable(
    "payslips",
    store.payslips,
    (p) => ({
      org_id: ORG_ID,
      id: p.id,
      payroll_run_id: p.payrollRunId,
      user_id: p.userId,
      month: p.month,
      earnings: p.earnings,
      deductions: p.deductions,
      attendance_summary: p.attendanceSummary,
      gross: p.gross,
      net: p.net,
      status: p.status,
      deleted_at: p.deletedAt,
      created_at: p.createdAt,
    })
  );

  await syncTable(
    "salary_history",
    store.salaryHistory,
    (h) => ({
      org_id: ORG_ID,
      id: h.id,
      user_id: h.userId,
      rev_date: h.date,
      old_salary: h.old,
      new_salary: h.newS,
      revised_by: h.by,
      note: h.note,
    })
  );

  await syncTable(
    "salary_schedules",
    store.salarySchedules,
    (s) => ({
      org_id: ORG_ID,
      id: s.id,
      user_id: s.userId,
      new_salary: s.newSalary,
      effective_at: s.effectiveAt,
      note: s.note,
      created_by: s.createdBy,
      applied: !!s.applied,
      applied_at: s.appliedAt,
      deleted_at: s.deletedAt,
    })
  );

  await syncTable(
    "location_punches",
    store.locationPunches,
    (p) => ({
      org_id: ORG_ID,
      id: p.id,
      user_id: p.userId,
      punch_date: p.date,
      punch_type: p.type,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      distance_meters: p.distanceMeters,
      office_id: p.officeId,
      within_fence: p.withinFence,
      ip: p.ip,
      device: p.device,
      punched_at: p.ts,
      deleted_at: p.deletedAt,
    })
  );

  await syncTable(
    "office_locations",
    store.officeLocations,
    (o) => ({
      org_id: ORG_ID,
      id: o.id,
      name: o.name,
      lat: o.lat,
      lng: o.lng,
      radius_meters: o.radiusMeters,
      dept_ids: o.deptIds || [],
      shift_ids: o.shiftIds || [],
      active: o.active !== false,
    })
  );

  await syncTable(
    "history_requests",
    store.historyRequests,
    (h) => ({
      org_id: ORG_ID,
      id: h.id,
      user_id: h.userId,
      date_from: h.dateFrom,
      reason: h.reason,
      status: h.status,
      applied_on: h.appliedOn,
    })
  );

  await syncTable(
    "advance_approvals",
    store.advanceApprovals,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      request_id: a.requestId,
      step: a.step,
      action: a.action,
      by_user_id: a.byUserId,
      role: a.role,
      note: a.note,
      approved_at: a.ts || new Date().toISOString(),
    })
  );

  await syncTable(
    "advance_audit_logs",
    store.advanceAuditLogs,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      request_id: a.requestId,
      entity_type: a.entityType,
      field: a.field,
      old_value: a.oldValue,
      new_value: a.newValue,
      action: a.action,
      changed_by: a.changedBy,
      role: a.role,
      ip: a.ip,
      logged_at: a.ts || new Date().toISOString(),
      immutable: a.immutable !== false,
    })
  );

  await syncTable(
    "enterprise_audit_logs",
    store.enterpriseAuditLogs,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      module: a.module,
      entity_type: a.entityType,
      entity_id: a.entityId,
      action: a.action,
      field: a.field,
      old_value: a.oldValue,
      new_value: a.newValue,
      changed_by: a.changedBy,
      role: a.role,
      ip: a.ip,
      device: a.device,
      logged_at: a.ts || new Date().toISOString(),
      immutable: a.immutable !== false,
    })
  );

  await syncTable(
    "audit_archive",
    store.auditArchive,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      user_id: a.userId,
      action: a.action,
      detail: a.detail,
      logged_at: a.ts,
      ip: a.ip,
    })
  );

  await syncTable(
    "login_activity",
    store.loginActivity,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      user_id: a.userId,
      email: a.email,
      role: a.role,
      logged_at: a.ts,
      ip: a.ip,
      device: a.device,
    })
  );

  await syncTable(
    "password_resets",
    store.passwordResets,
    (a) => ({
      org_id: ORG_ID,
      id: a.id,
      user_id: a.userId,
      reset_by: a.resetBy,
      reset_at: a.resetAt,
    })
  );
}
