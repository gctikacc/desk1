/**
 * Advance Salary Request workflow — data layer + UI (localStorage-backed tables)
 */

import { useState, useEffect, Fragment } from "react";
import {
  Check, X, ChevronRight, DollarSign, FileText, Eye,
} from "lucide-react";

export const ADV_STATUS = {
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  MODIFIED: "modified_by_admin",
  WAITING_STAFF: "waiting_staff_confirmation",
  APPROVED: "approved",
  IN_DEDUCTION: "in_deduction",
  COMPLETED: "completed",
  REJECTED: "rejected",
};

export const ADV_STATUS_FLOW = [
  ADV_STATUS.PENDING,
  ADV_STATUS.UNDER_REVIEW,
  ADV_STATUS.MODIFIED,
  ADV_STATUS.WAITING_STAFF,
  ADV_STATUS.APPROVED,
  ADV_STATUS.IN_DEDUCTION,
  ADV_STATUS.COMPLETED,
];

const ADV_STATUS_LABELS = {
  pending: "Pending",
  under_review: "Under Review",
  modified_by_admin: "Modified By Admin",
  waiting_staff_confirmation: "Waiting Staff Confirmation",
  approved: "Approved",
  in_deduction: "In Deduction",
  completed: "Completed",
  rejected: "Rejected",
};

const ADV_STATUS_COLORS = {
  pending: "orange",
  under_review: "blue",
  modified_by_admin: "purple",
  waiting_staff_confirmation: "orange",
  approved: "green",
  in_deduction: "blue",
  completed: "green",
  rejected: "red",
};

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().split("T")[0];
const monthStr = (d = new Date()) => d.toISOString().slice(0, 7);

const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const migrateAdvanceStore = (s) => {
  if (!s.advanceSalaryRequests) {
    const legacy = s.advanceRequests || [];
    s.advanceSalaryRequests = legacy.map((a) => {
      const st =
        a.status === "approved"
          ? ADV_STATUS.IN_DEDUCTION
          : a.status === "rejected"
            ? ADV_STATUS.REJECTED
            : ADV_STATUS.PENDING;
      const amt = a.amount || 0;
      const monthly = a.monthly || amt;
      return {
        id: a.id,
        userId: a.userId,
        status: st,
        requestedAmount: amt,
        approvedAmount: st === ADV_STATUS.IN_DEDUCTION ? amt : null,
        monthlyDeduction: monthly,
        installmentsCount: Math.max(1, Math.ceil(amt / (monthly || 1))),
        deductionStartDate: a.appliedOn || todayStr(),
        reason: a.reason || "",
        termsNotes: "",
        requestType: a.type || "installment",
        overflow: a.overflow || 0,
        remainingBalance: st === ADV_STATUS.IN_DEDUCTION ? amt : amt,
        appliedOn: a.appliedOn || todayStr(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        staffConfirmedAt: st === ADV_STATUS.IN_DEDUCTION ? a.appliedOn : null,
      };
    });
  }
  if (!s.advanceInstallments) s.advanceInstallments = [];
  if (!s.advanceApprovals) s.advanceApprovals = [];
  if (!s.advanceAuditLogs) s.advanceAuditLogs = [];
  syncLegacyAdvanceRequests(s);
  return s;
};

export const syncLegacyAdvanceRequests = (s) => {
  s.advanceRequests = (s.advanceSalaryRequests || [])
    .filter((r) => !r.deletedAt)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      amount: r.requestedAmount,
      monthly: r.monthlyDeduction,
      status:
        r.status === ADV_STATUS.IN_DEDUCTION || r.status === ADV_STATUS.COMPLETED
          ? "approved"
          : r.status === ADV_STATUS.REJECTED
            ? "rejected"
            : r.status,
      reason: r.reason,
      overflow: r.overflow || 0,
      type: r.requestType || "installment",
      appliedOn: r.appliedOn,
      workflowStatus: r.status,
    }));
};

export const getActiveAdvanceRequests = (store) => {
  migrateAdvanceStore(store);
  return (store.advanceSalaryRequests || []).filter((r) => !r.deletedAt);
};

export const getAdvanceAuditLogs = (store, requestId) =>
  (store.advanceAuditLogs || [])
    .filter((l) => l.requestId === requestId)
    .sort((a, b) => (b.ts > a.ts ? 1 : -1));

export const getAdvanceInstallments = (store, requestId) =>
  (store.advanceInstallments || [])
    .filter((i) => i.requestId === requestId && !i.deletedAt)
    .sort((a, b) => a.sequence - b.sequence);

export const getUserAdvanceRole = (user) => {
  if (!user) return "staff";
  if (user.role === "admin") return "super_admin";
  if (user.role === "manager") {
    if (user.managerPerms?.canApproveAdvanceFinance) return "finance";
    if (user.managerPerms?.canReviewAdvance !== false) return "hr";
    return "hr";
  }
  return "staff";
};

export const canAdvanceAction = (user, action) => {
  const role = getUserAdvanceRole(user);
  if (role === "super_admin") return true;
  if (action === "view_own") return true;
  if (action === "submit") return role === "staff";
  if (action === "review" || action === "edit_proposal" || action === "send_to_staff")
    return role === "hr" || role === "finance";
  if (action === "approve_finance" || action === "start_deduction") return role === "finance";
  if (action === "reject") return role === "hr" || role === "finance";
  if (action === "staff_confirm" || action === "staff_decline") return role === "staff";
  if (action === "view_audit") return role !== "staff";
  return false;
};

export const pushAdvanceAudit = (s, { requestId, field, oldValue, newValue, changedBy, role, ip = "127.0.0.1", action = "update" }) => {
  if (!s.advanceAuditLogs) s.advanceAuditLogs = [];
  s.advanceAuditLogs.unshift({
    id: uid(),
    requestId,
    entityType: "advance_salary_requests",
    field,
    oldValue: oldValue == null ? null : String(oldValue),
    newValue: newValue == null ? null : String(newValue),
    action,
    changedBy,
    role,
    ip,
    ts: new Date().toISOString(),
    immutable: true,
  });
};

export const pushAdvanceApproval = (s, { requestId, step, action, byUserId, role, note = "" }) => {
  if (!s.advanceApprovals) s.advanceApprovals = [];
  s.advanceApprovals.push({
    id: uid(),
    requestId,
    step,
    action,
    byUserId,
    role,
    note,
    ts: new Date().toISOString(),
  });
};

export const pushAdvanceNotification = (s, { userId, type, msg, requestId }) => {
  if (!s.notifications) s.notifications = [];
  s.notifications.unshift({
    id: uid(),
    userId,
    type: `advance_${type}`,
    msg,
    read: false,
    date: todayStr(),
    requestId,
  });
};

const notifyHrFinance = (s, msg, requestId) => {
  (s.users || [])
    .filter((u) => u.active && (u.role === "admin" || u.role === "manager"))
    .forEach((u) => pushAdvanceNotification(s, { userId: u.id, type: "workflow", msg, requestId }));
};

export const buildInstallmentSchedule = (request) => {
  const total = request.approvedAmount ?? request.requestedAmount;
  const monthly = request.monthlyDeduction || total;
  const count = Math.max(1, request.installmentsCount || Math.ceil(total / monthly));
  const startYm = (request.deductionStartDate || todayStr()).slice(0, 7);
  const rows = [];
  let remaining = total;
  for (let i = 0; i < count; i++) {
    const amt = i === count - 1 ? remaining : Math.min(monthly, remaining);
    remaining -= amt;
    rows.push({
      id: uid(),
      requestId: request.id,
      sequence: i + 1,
      dueMonth: addMonths(startYm, i),
      amount: amt,
      status: "scheduled",
      paidAt: null,
      paidAmount: 0,
      deletedAt: null,
    });
  }
  return rows;
};

export const activateUserAdvanceFromRequest = (s, req) => {
  const u = s.users.find((x) => x.id === req.userId);
  if (!u) return;
  const total = req.approvedAmount ?? req.requestedAmount;
  const gross = (u.salary?.basic || 0) + (u.salary?.hra || 0) + (u.salary?.transport || 0) + (u.salary?.medical || 0);
  const overflow = total > gross ? total - gross : 0;
  u.advance = {
    active: true,
    requestId: req.id,
    total,
    remaining: req.remainingBalance ?? total,
    monthly: req.monthlyDeduction,
    overflow,
  };
};

export const processPayrollAdvanceDeductions = (s, currentMonth = monthStr()) => {
  migrateAdvanceStore(s);
  (s.advanceSalaryRequests || [])
    .filter((r) => !r.deletedAt && r.status === ADV_STATUS.IN_DEDUCTION)
    .forEach((req) => {
      const inst = (s.advanceInstallments || []).find(
        (i) => i.requestId === req.id && i.dueMonth === currentMonth && i.status === "scheduled" && !i.deletedAt
      );
      if (!inst) return;
      const u = s.users.find((x) => x.id === req.userId);
      if (!u?.advance?.active) return;
      const pay = Math.min(inst.amount, req.remainingBalance || 0);
      if (pay <= 0) return;
      inst.status = "paid";
      inst.paidAt = new Date().toISOString();
      inst.paidAmount = pay;
      req.remainingBalance = Math.max(0, (req.remainingBalance || 0) - pay);
      u.advance.remaining = req.remainingBalance;
      if (req.remainingBalance <= 0) {
        req.status = ADV_STATUS.COMPLETED;
        u.advance.active = false;
        pushAdvanceNotification(s, {
          userId: req.userId,
          type: "completed",
          msg: `Advance salary deduction completed — ${pay} PKR final installment`,
          requestId: req.id,
        });
      }
      pushAdvanceAudit(s, {
        requestId: req.id,
        field: "payroll_deduction",
        oldValue: req.remainingBalance + pay,
        newValue: req.remainingBalance,
        changedBy: "system",
        role: "payroll",
        action: "deduction",
      });
    });
  syncLegacyAdvanceRequests(s);
};

export const submitAdvanceRequest = (s, { user, amount, monthly, reason, type, calcTotal }) => {
  migrateAdvanceStore(s);
  const gross = calcTotal(user.salary);
  const amt = Number(amount);
  const monthlyDed = type === "full" ? gross : Number(monthly) || Math.min(amt, gross);
  const id = uid();
  const req = {
    id,
    userId: user.id,
    status: ADV_STATUS.PENDING,
    requestedAmount: amt,
    approvedAmount: null,
    monthlyDeduction: monthlyDed,
    installmentsCount: Math.max(1, Math.ceil(amt / monthlyDed)),
    deductionStartDate: todayStr(),
    reason,
    termsNotes: "",
    requestType: type,
    overflow: amt > gross ? amt - gross : 0,
    remainingBalance: amt,
    appliedOn: todayStr(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    staffConfirmedAt: null,
  };
  s.advanceSalaryRequests.push(req);
  pushAdvanceAudit(s, {
    requestId: id,
    field: "status",
    oldValue: null,
    newValue: ADV_STATUS.PENDING,
    changedBy: user.id,
    role: "staff",
    action: "create",
  });
  pushAdvanceApproval(s, { requestId: id, step: "submit", action: "submitted", byUserId: user.id, role: "staff", note: reason });
  notifyHrFinance(s, `${user.name} submitted advance salary request ${amt} PKR`, id);
  pushAdvanceNotification(s, {
    userId: user.id,
    type: "submitted",
    msg: `Your advance request of PKR ${amt.toLocaleString()} was submitted`,
    requestId: id,
  });
  syncLegacyAdvanceRequests(s);
};

export const transitionAdvanceRequest = (s, { requestId, actor, ip, patch, newStatus, approvalStep, approvalAction, approvalNote }) => {
  migrateAdvanceStore(s);
  const req = s.advanceSalaryRequests.find((r) => r.id === requestId && !r.deletedAt);
  if (!req) return { ok: false, error: "Request not found" };
  const role = getUserAdvanceRole(actor);
  Object.entries(patch || {}).forEach(([field, newValue]) => {
    const oldValue = req[field];
    if (oldValue !== newValue) {
      pushAdvanceAudit(s, { requestId, field, oldValue, newValue, changedBy: actor.id, role, ip });
      req[field] = newValue;
    }
  });
  if (newStatus && req.status !== newStatus) {
    pushAdvanceAudit(s, { requestId, field: "status", oldValue: req.status, newValue: newStatus, changedBy: actor.id, role, ip, action: "status_change" });
    req.status = newStatus;
  }
  req.updatedAt = new Date().toISOString();
  if (approvalStep) {
    pushAdvanceApproval(s, { requestId, step: approvalStep, action: approvalAction || "update", byUserId: actor.id, role, note: approvalNote || "" });
  }
  syncLegacyAdvanceRequests(s);
  return { ok: true, request: req };
};

// ─── UI helpers (need tk from theme) ─────────────────────────────────────────

export function AdvanceStatusBadge({ status, tk }) {
  const label = ADV_STATUS_LABELS[status] || status;
  const color = ADV_STATUS_COLORS[status] || "neutral";
  return <span style={{ display: "inline-flex" }}><BadgeProxy color={color} tk={tk}>{label}</BadgeProxy></span>;
}

function BadgeProxy({ children, color, tk }) {
  const m = {
    neutral: { bg: tk.sub, t: tk.textS },
    gold: { bg: tk.goldBg, t: tk.gold },
    blue: { bg: tk.blueBg, t: tk.blue },
    green: { bg: tk.greenBg, t: tk.green },
    red: { bg: tk.redBg, t: tk.red },
    orange: { bg: tk.orangeBg, t: tk.orange },
    purple: { bg: tk.purpleBg, t: tk.purple },
  };
  const c = m[color] || m.neutral;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.t, whiteSpace: "nowrap", textTransform: "capitalize" }}>
      {children}
    </span>
  );
}

export function AdvanceTimeline({ status, tk }) {
  const idx = ADV_STATUS_FLOW.indexOf(status);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
      {ADV_STATUS_FLOW.map((st, i) => {
        const done = status === ADV_STATUS.REJECTED ? false : i <= idx;
        const active = st === status;
        return (
          <div key={st} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: done ? tk.text : tk.textM, fontWeight: active ? 600 : 400 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: done ? (active ? tk.gold : tk.green) : tk.border }} />
            <span>{ADV_STATUS_LABELS[st]}</span>
            {i < ADV_STATUS_FLOW.length - 1 && <ChevronRight size={10} style={{ color: tk.border }} />}
          </div>
        );
      })}
    </div>
  );
}

export function AdvanceAuditModal({ open, onClose, requestId, store, tk, fmtDate, users }) {
  const logs = getAdvanceAuditLogs(store, requestId);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: tk.card, border: `1px solid ${tk.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: tk.text }}>Audit Log</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: tk.textS }}><X size={18} /></button>
        </div>
        {logs.length === 0 ? (
          <p style={{ fontSize: 13, color: tk.textM }}>No audit entries</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {logs.map((l) => {
              const u = users.find((x) => x.id === l.changedBy);
              return (
                <div key={l.id} style={{ padding: "10px 12px", background: tk.sub, borderRadius: 8, border: `1px solid ${tk.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: tk.text }}>{l.field} · {l.action}</span>
                    <span style={{ fontSize: 10, color: tk.textM }}>{l.ts?.slice(0, 19).replace("T", " ")}</span>
                  </div>
                  <div style={{ fontSize: 11, color: tk.textS }}>
                    {u?.name || l.changedBy} · <span style={{ textTransform: "capitalize" }}>{l.role}</span> · {l.ip}
                  </div>
                  {(l.oldValue != null || l.newValue != null) && (
                    <div style={{ fontSize: 11, marginTop: 4, fontFamily: "'JetBrains Mono',monospace" }}>
                      <span style={{ color: tk.red }}>{l.oldValue ?? "—"}</span>
                      {" → "}
                      <span style={{ color: tk.green }}>{l.newValue ?? "—"}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function calcInstallments(amount, monthly) {
  const a = Number(amount) || 0;
  const m = Number(monthly) || 1;
  return Math.max(1, Math.ceil(a / m));
}

export function AdvanceSalaryPanel({
  store,
  refresh,
  tk,
  user,
  fmtPKR,
  fmtDate,
  calcTotal,
  updateStore,
  uid: uidProp,
  Card,
  Btn,
  Inp,
  Empty,
  Av,
  SBar,
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [form, setForm] = useState(null);

  const requests = getActiveAdvanceRequests(store)
    .filter((r) => {
      if (user.role === "staff") return r.userId === user.id;
      const u = store.users.find((x) => x.id === r.userId);
      return u?.name?.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => (b.appliedOn > a.appliedOn ? 1 : -1));

  const selected = requests.find((r) => r.id === selectedId) || null;
  const staffUser = selected ? store.users.find((u) => u.id === selected.userId) : null;
  const gross = staffUser ? calcTotal(staffUser.salary) : 0;

  useEffect(() => {
    if (!selected) {
      setForm(null);
      return;
    }
    const approved = selected.approvedAmount ?? selected.requestedAmount;
    const inst = Math.max(1, selected.installmentsCount || 1);
    setForm({
      approvedAmount: approved,
      monthlyDeduction: Math.round(Number(approved) / inst),
      installmentsCount: inst,
      deductionStartDate: selected.deductionStartDate || todayStr(),
      termsNotes: selected.termsNotes || "",
    });
  }, [selectedId]);

  const syncInstallments = (approved, installments) => {
    const inst = Math.max(0, Number(installments) || 0);
    const amt = Number(approved) || 0;
    if (inst <= 0) return { installmentsCount: 0, monthlyDeduction: 0 };
    return { installmentsCount: inst, monthlyDeduction: Math.round(amt / inst) };
  };

  const openRequest = (id) => setSelectedId(id === selectedId ? null : id);

  const runTransition = (fn) => {
    updateStore((s) => {
      processPayrollAdvanceDeductions(s);
      const res = fn(s);
      syncLegacyAdvanceRequests(s);
      return s;
    });
    refresh();
  };

  const saveProposal = () => {
    if (!selected || !form) return;
    if (!form.installmentsCount || Number(form.installmentsCount) <= 0) return;
    runTransition((s) => {
      transitionAdvanceRequest(s, {
        requestId: selected.id,
        actor: user,
        patch: {
          approvedAmount: Number(form.approvedAmount),
          monthlyDeduction: Number(form.monthlyDeduction),
          installmentsCount: Number(form.installmentsCount),
          deductionStartDate: form.deductionStartDate,
          termsNotes: form.termsNotes,
        },
        newStatus: ADV_STATUS.MODIFIED,
        approvalStep: "review",
        approvalAction: "modified",
        approvalNote: form.termsNotes,
      });
      return { ok: true };
    });
  };

  const sendToStaff = () => {
    if (!selected || !form) return;
    if (!form.installmentsCount || Number(form.installmentsCount) <= 0) return;
    runTransition((s) => {
      transitionAdvanceRequest(s, {
        requestId: selected.id,
        actor: user,
        patch: {
          approvedAmount: Number(form.approvedAmount),
          monthlyDeduction: Number(form.monthlyDeduction),
          installmentsCount: Number(form.installmentsCount),
          deductionStartDate: form.deductionStartDate,
          termsNotes: form.termsNotes,
        },
        newStatus: ADV_STATUS.WAITING_STAFF,
        approvalStep: "hr",
        approvalAction: "sent_to_staff",
      });
      const req = s.advanceSalaryRequests.find((r) => r.id === selected.id);
      pushAdvanceNotification(s, {
        userId: req.userId,
        type: "modified",
        msg: `Advance request updated by admin — please review and confirm`,
        requestId: selected.id,
      });
      pushAdvanceNotification(s, {
        userId: req.userId,
        type: "waiting_confirmation",
        msg: `Advance terms awaiting your confirmation`,
        requestId: selected.id,
      });
      return { ok: true };
    });
  };

  const startReview = (id) => {
    runTransition((s) => {
      transitionAdvanceRequest(s, {
        requestId: id,
        actor: user,
        newStatus: ADV_STATUS.UNDER_REVIEW,
        approvalStep: "review",
        approvalAction: "under_review",
      });
      return { ok: true };
    });
  };

  const financeApprove = () => {
    if (!selected) return;
    runTransition((s) => {
      transitionAdvanceRequest(s, {
        requestId: selected.id,
        actor: user,
        newStatus: ADV_STATUS.APPROVED,
        approvalStep: "finance",
        approvalAction: "approved",
      });
      return { ok: true };
    });
  };

  const startDeduction = () => {
    if (!selected || !form) return;
    runTransition((s) => {
      const req = s.advanceSalaryRequests.find((r) => r.id === selected.id);
      if (!req?.staffConfirmedAt) return { ok: false };
      transitionAdvanceRequest(s, {
        requestId: selected.id,
        actor: user,
        patch: {
          approvedAmount: Number(form.approvedAmount),
          monthlyDeduction: Number(form.monthlyDeduction),
          installmentsCount: Number(form.installmentsCount),
          deductionStartDate: form.deductionStartDate,
          remainingBalance: Number(form.approvedAmount),
        },
        newStatus: ADV_STATUS.IN_DEDUCTION,
        approvalStep: "finance",
        approvalAction: "deduction_started",
      });
      s.advanceInstallments = (s.advanceInstallments || []).filter((i) => i.requestId !== req.id);
      buildInstallmentSchedule(req).forEach((row) => s.advanceInstallments.push(row));
      activateUserAdvanceFromRequest(s, req);
      pushAdvanceNotification(s, {
        userId: req.userId,
        type: "approved",
        msg: `Advance approved — deductions start ${form.deductionStartDate}`,
        requestId: req.id,
      });
      return { ok: true };
    });
  };

  const rejectRequest = (id) => {
    runTransition((s) => {
      transitionAdvanceRequest(s, {
        requestId: id,
        actor: user,
        newStatus: ADV_STATUS.REJECTED,
        approvalStep: "review",
        approvalAction: "rejected",
      });
      const req = s.advanceSalaryRequests.find((r) => r.id === id);
      if (req) {
        pushAdvanceNotification(s, {
          userId: req.userId,
          type: "rejected",
          msg: `Advance salary request was rejected`,
          requestId: id,
        });
      }
      return { ok: true };
    });
    setSelectedId(null);
  };

  const pendingCount = requests.filter((r) =>
    [ADV_STATUS.PENDING, ADV_STATUS.UNDER_REVIEW, ADV_STATUS.WAITING_STAFF].includes(r.status)
  ).length;

  const canReview = canAdvanceAction(user, "review");
  const canFinance = canAdvanceAction(user, "approve_finance");
  const canOverride = getUserAdvanceRole(user) === "super_admin";

  return (
    <div>
      {user.role !== "staff" && (
        <div style={{ marginBottom: 14 }}>
          <SBar value={search} onChange={setSearch} placeholder="Search staff..." />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,360px)", gap: 16 }} className="grid-2">
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {requests.length === 0 ? (
            <Empty icon={DollarSign} title="No advance requests" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${tk.border}` }}>
                    {["Staff", "Amount", "Monthly", "Note", "Reason", "Status", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: tk.textM, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((adv) => {
                    const u = store.users.find((x) => x.id === adv.userId);
                    const dispAmt = adv.approvedAmount ?? adv.requestedAmount;
                    const overflow = dispAmt > calcTotal(u?.salary || {});
                    const isSel = selectedId === adv.id;
                    return (
                      <Fragment key={adv.id}>
                        <tr
                          onClick={() => openRequest(adv.id)}
                          style={{ borderBottom: isSel ? "none" : `1px solid ${tk.border}`, cursor: "pointer", background: isSel ? tk.hover : "transparent" }}
                        >
                          <td style={{ padding: "11px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <ChevronRight size={14} style={{ color: tk.textM, transform: isSel ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                              <Av initials={u?.initials || "?"} size={30} />
                              <span style={{ fontWeight: 500, color: tk.text }}>{u?.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: tk.gold }}>{fmtPKR(dispAmt)}</td>
                          <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono',monospace", color: tk.textS }}>{fmtPKR(adv.monthlyDeduction || 0)}/mo</td>
                          <td style={{ padding: "11px 14px" }}>
                            {overflow ? <BadgeProxy color="orange" tk={tk}>Overflow next month</BadgeProxy> : <BadgeProxy color="green" tk={tk}>Within salary</BadgeProxy>}
                          </td>
                          <td style={{ padding: "11px 14px", color: tk.textS, maxWidth: 140 }}>{adv.reason}</td>
                          <td style={{ padding: "11px 14px" }}>
                            <AdvanceStatusBadge status={adv.status} tk={tk} />
                          </td>
                          <td style={{ padding: "11px 14px" }} onClick={(e) => e.stopPropagation()}>
                            <Btn variant="ghost" size="sm" onClick={() => { setSelectedId(adv.id); setAuditOpen(true); }} title="Audit log">
                              <Eye size={13} />
                            </Btn>
                          </td>
                        </tr>
                        {isSel && form && (
                          <tr>
                            <td colSpan={7} style={{ padding: "0 14px 14px", background: tk.sub, borderBottom: `1px solid ${tk.border}` }}>
                              <div className="slide-up" style={{ paddingTop: 12 }}>
                                <AdvanceTimeline status={adv.status} tk={tk} />
                                <div style={{ fontSize: 11, color: tk.textM, marginBottom: 8 }}>
                                  Remaining balance: <strong style={{ color: tk.orange }}>{fmtPKR(adv.remainingBalance ?? 0)}</strong>
                                </div>
                                {getAdvanceInstallments(store, adv.id).length > 0 && (
                                  <div style={{ marginBottom: 10, fontSize: 11, color: tk.textS }}>
                                    Installments:{" "}
                                    {getAdvanceInstallments(store, adv.id).map((i) => (
                                      <span key={i.id} style={{ marginRight: 8 }}>
                                        {i.dueMonth} {fmtPKR(i.paidAmount || i.amount)} ({i.status})
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div>
          {selected && form ? (
            <Card style={{ padding: 16, position: "sticky", top: 80 }} data-nav-target="advance-panel">
              <div style={{ fontWeight: 600, fontSize: 14, color: tk.text, marginBottom: 12 }}>Approval & Terms</div>
              <Inp label="Approved Amount (PKR)" value={form.approvedAmount} onChange={(v) => setForm((f) => ({ ...f, approvedAmount: v, ...syncInstallments(v, f.installmentsCount) }))} type="number" />
              <Inp label="Installments (required)" value={form.installmentsCount} onChange={(v) => setForm((f) => ({ ...f, ...syncInstallments(f.approvedAmount, v) }))} type="number" min={1} />
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: tk.textS, marginBottom: 5 }}>Monthly Deduction (auto)</div>
                <div style={{ padding: "10px 12px", borderRadius: 8, background: tk.sub, border: `1px solid ${tk.border}`, fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 600, color: tk.gold }}>
                  {form.installmentsCount > 0 ? fmtPKR(form.monthlyDeduction) : "— set installments"}
                </div>
                <div style={{ fontSize: 11, color: tk.textM, marginTop: 6 }}>
                  {form.installmentsCount > 0 ? `${form.installmentsCount} × ${fmtPKR(form.monthlyDeduction)} = ${fmtPKR(form.monthlyDeduction * form.installmentsCount)}` : "Installments must be greater than 0"}
                </div>
              </div>
              <Inp label="Deduction Start Date" value={form.deductionStartDate} onChange={(v) => setForm((f) => ({ ...f, deductionStartDate: v }))} type="date" />
              <Inp label="Notes / Terms" value={form.termsNotes} onChange={(v) => setForm((f) => ({ ...f, termsNotes: v }))} type="textarea" placeholder="Terms communicated to staff..." />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {selected.status === ADV_STATUS.PENDING && canReview && (
                  <Btn variant="blue" size="sm" onClick={() => startReview(selected.id)}>Start Review</Btn>
                )}
                {[ADV_STATUS.PENDING, ADV_STATUS.UNDER_REVIEW, ADV_STATUS.MODIFIED].includes(selected.status) && (canReview || canOverride) && (
                  <>
                    <Btn variant="secondary" size="sm" onClick={saveProposal}>Save Changes</Btn>
                    <Btn variant="primary" size="sm" onClick={sendToStaff}>Send to Staff</Btn>
                  </>
                )}
                {selected.status === ADV_STATUS.WAITING_STAFF && selected.staffConfirmedAt && (canFinance || canOverride) && (
                  <>
                    <Btn variant="success" size="sm" onClick={financeApprove}>Finance Approve</Btn>
                    <Btn variant="primary" size="sm" onClick={startDeduction}>Start Deduction</Btn>
                  </>
                )}
                {selected.status === ADV_STATUS.APPROVED && (canFinance || canOverride) && (
                  <Btn variant="primary" size="sm" onClick={startDeduction}>Start Deduction</Btn>
                )}
                {![ADV_STATUS.COMPLETED, ADV_STATUS.REJECTED, ADV_STATUS.IN_DEDUCTION].includes(selected.status) && (canReview || canFinance || canOverride) && (
                  <Btn variant="danger" size="sm" onClick={() => rejectRequest(selected.id)}>Reject</Btn>
                )}
              </div>
              <Btn variant="ghost" size="sm" style={{ marginTop: 10 }} onClick={() => setAuditOpen(true)}><FileText size={13} /> View audit log</Btn>
            </Card>
          ) : (
            <Card style={{ padding: 20, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: tk.textM }}>Select a request to review terms, timeline, and actions.</p>
              {pendingCount > 0 && <p style={{ fontSize: 12, color: tk.orange, marginTop: 8 }}>{pendingCount} open workflow item(s)</p>}
            </Card>
          )}
        </div>
      </div>
      <AdvanceAuditModal open={auditOpen} onClose={() => setAuditOpen(false)} requestId={selectedId} store={store} tk={tk} fmtDate={fmtDate} users={store.users} />
    </div>
  );
}

export function staffConfirmAdvance(updateStore, refresh, { user, requestId, accept, fmtPKR }) {
  updateStore((s) => {
    const req = s.advanceSalaryRequests?.find((r) => r.id === requestId && r.userId === user.id);
    if (!req || req.status !== ADV_STATUS.WAITING_STAFF) return s;
    if (accept) {
      req.staffConfirmedAt = new Date().toISOString();
      transitionAdvanceRequest(s, {
        requestId,
        actor: user,
        newStatus: ADV_STATUS.APPROVED,
        approvalStep: "staff",
        approvalAction: "confirmed",
        approvalNote: "Staff accepted terms",
      });
      notifyHrFinance(s, `${user.name} confirmed advance terms — finance approval required`, requestId);
      pushAdvanceNotification(s, {
        userId: user.id,
        type: "approved",
        msg: `You accepted advance terms. Deduction starts after finance authorization.`,
        requestId,
      });
    } else {
      transitionAdvanceRequest(s, {
        requestId,
        actor: user,
        newStatus: ADV_STATUS.UNDER_REVIEW,
        approvalStep: "staff",
        approvalAction: "declined",
        approvalNote: "Staff declined terms",
      });
      notifyHrFinance(s, `${user.name} declined advance terms`, requestId);
    }
    syncLegacyAdvanceRequests(s);
    return s;
  });
  refresh();
}

export function staffAdvanceHistoryItem(item, tk, fmtPKR, Badge, Btn, onConfirm, onDecline) {
  const st = item.workflowStatus || item.status;
  const needsConfirm = st === ADV_STATUS.WAITING_STAFF;
  const amt = item.approvedAmount ?? item.requestedAmount ?? item.amount;
  const monthly = item.monthlyDeduction ?? item.monthly;
  const type = item.requestType || item.type;
  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 600, color: tk.gold, marginBottom: 2 }}>
        {fmtPKR(amt)} · {type === "full" ? "Full deduct" : `${fmtPKR(monthly)}/mo`}
      </div>
      {needsConfirm && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Btn variant="success" size="sm" onClick={() => onConfirm(item.id)}><Check size={12} /> Accept Terms</Btn>
          <Btn variant="danger" size="sm" onClick={() => onDecline(item.id)}><X size={12} /> Decline</Btn>
        </div>
      )}
    </>
  );
}

export function pendingAdvanceCount(store) {
  return getActiveAdvanceRequests(store).filter((r) =>
    [ADV_STATUS.PENDING, ADV_STATUS.UNDER_REVIEW, ADV_STATUS.MODIFIED, ADV_STATUS.WAITING_STAFF].includes(r.status)
  ).length;
}
