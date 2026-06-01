/**
 * Enterprise UI modules — payroll, toasts, validation banner
 */

import { useState, useEffect, createContext, useContext } from "react";
import { DollarSign, Download, Lock, RefreshCw, AlertTriangle, MapPin } from "lucide-react";
import {
  monthStr,
  processPayrollRun,
  canEnterprisePerm,
  resolveEnterpriseRole,
} from "./enterpriseStore.js";
import { exportPayrollReport, exportAttendanceReport, exportAdvanceReport, printPayslipPDF, downloadAllPayslips } from "./exportUtils.js";
import { getActiveAdvanceRequests } from "../advanceWorkflow.jsx";

const ToastCtx = createContext({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children, tk }) {
  const [items, setItems] = useState([]);
  const push = (msg, type = "info") => {
    const id = Math.random().toString(36).slice(2, 8);
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
  };
  const colors = { info: tk.blue, success: tk.green, error: tk.red, warning: tk.orange };
  const bgs = { info: tk.blueBg, success: tk.greenBg, error: tk.redBg, warning: tk.orangeBg };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div style={{ position: "fixed", bottom: 72, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
        {items.map((t) => (
          <div key={t.id} className="slide-up" style={{ padding: "12px 16px", borderRadius: 10, background: bgs[t.type] || tk.card, border: `1px solid ${colors[t.type] || tk.border}`, color: colors[t.type] || tk.text, fontSize: 13, boxShadow: tk.shadow }}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Spinner({ tk, size = 18 }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid ${tk.border}`,
        borderTopColor: tk.gold,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

export function ValidationBanner({ store, tk }) {
  const warnings = store._validationWarnings || [];
  if (!warnings.length) return null;
  return (
    <CardWrap tk={tk} style={{ marginBottom: 14, padding: 12, borderColor: tk.orange, background: tk.orangeBg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <AlertTriangle size={16} style={{ color: tk.orange }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: tk.text }}>Policy alerts ({warnings.length})</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {warnings.slice(0, 5).map((w, i) => (
          <div key={i} style={{ fontSize: 12, color: tk.textS }}>{w.msg}</div>
        ))}
      </div>
    </CardWrap>
  );
}

function CardWrap({ children, tk, style }) {
  return <div style={{ background: tk.card, border: `1px solid ${tk.border}`, borderRadius: 12, ...style }}>{children}</div>;
}

export function PayrollAdminTab({ store, refresh, tk, user, fmtPKR, fmtDate, updateStore, Card, Btn, Empty, Av, Badge, Toggle }) {
  const { push } = useToast();
  const month = monthStr();
  const [selMonth, setSelMonth] = useState(month);
  const [loading, setLoading] = useState(false);
  const manualEdit = !!store.settings?.payrollManualEdit;
  const run = (store.payrollRuns || []).find((r) => r.month === selMonth && !r.deletedAt);
  const slips = (store.payslips || []).filter((p) => p.month === selMonth && !p.deletedAt);
  const canProcess = canEnterprisePerm(user, "payroll_process", "salary", store) || user.role === "admin";
  const canLock = canEnterprisePerm(user, "payroll_lock", "salary", store) || user.role === "admin";

  const doProcess = (lock) => {
    setLoading(true);
    updateStore((s) => {
      const res = processPayrollRun(s, { month: selMonth, actor: user, lock });
      if (!res.ok) push(res.error, "error");
      else push(lock ? `Payroll locked for ${selMonth}` : `Payroll processed (${res.count} payslips)`, "success");
      return s;
    });
    refresh();
    setLoading(false);
  };

  const toggleManual = (on) => {
    updateStore((s) => {
      s.settings = { ...s.settings, payrollManualEdit: on };
      return s;
    });
    refresh();
  };

  return (
    <div>
      {Toggle && user?.role === "admin" && (
        <Card style={{ marginBottom: 14, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: tk.text }}>Admin editable payroll calculation</div>
            <div style={{ fontSize: 12, color: tk.textS }}>When ON, re-process uses manual overrides stored per payslip row (edit in table below after process).</div>
          </div>
          <Toggle on={manualEdit} onChange={toggleManual} />
        </Card>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <input type="month" value={selMonth} onChange={(e) => setSelMonth(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${tk.border}`, background: tk.card, color: tk.text, fontFamily: "'DM Sans'" }} />
        {canProcess && (
          <Btn variant="primary" size="sm" onClick={() => doProcess(false)} disabled={loading || run?.status === "locked"}>
            {loading ? <Spinner tk={tk} size={14} /> : <RefreshCw size={13} />} Process Payroll
          </Btn>
        )}
        {canLock && (
          <Btn variant="secondary" size="sm" onClick={() => doProcess(true)} disabled={loading || run?.status === "locked"}>
            <Lock size={13} /> Lock Month
          </Btn>
        )}
        <Btn variant="ghost" size="sm" onClick={() => exportPayrollReport(store, selMonth)}><Download size={13} /> CSV</Btn>
        <Btn variant="ghost" size="sm" onClick={() => exportAttendanceReport(store, selMonth)}><Download size={13} /> Attendance CSV</Btn>
        {slips.length > 0 && (
          <Btn variant="secondary" size="sm" onClick={() => {
            const res = downloadAllPayslips(store, selMonth, fmtPKR, fmtDate);
            push(res.ok ? `Opening ${res.count} payslip PDF(s)...` : res.error, res.ok ? "success" : "error");
          }}><Download size={13} /> Download All Slips</Btn>
        )}
      </div>
      {run ? (
        <div style={{ fontSize: 12, color: tk.textS, marginBottom: 12 }}>
          Status: <Badge color={run.status === "locked" ? "gold" : "green"}>{run.status}</Badge>
          {run.processedAt && ` · Processed ${fmtDate(run.processedAt.slice(0, 10))}`}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: tk.textM, marginBottom: 12 }}>No payroll run for this month yet.</p>
      )}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {slips.length === 0 ? (
          <Empty icon={DollarSign} title="No payslips — process payroll first" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${tk.border}` }}>
                  {["Staff", "Gross", "Deductions", "Net", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: tk.textM, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slips.map((p) => {
                  const u = store.users.find((x) => x.id === p.userId);
                  const ded = (p.deductions?.tax || 0) + (p.deductions?.advance || 0) + (p.deductions?.late || 0) + (p.deductions?.leave || 0);
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${tk.border}` }}>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Av initials={u?.initials || "?"} size={28} />
                          <span style={{ fontWeight: 500 }}>{u?.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono',monospace" }}>
                        {manualEdit && user?.role === "admin" ? (
                          <input type="number" value={p.gross} onChange={(e) => {
                            const v = Number(e.target.value);
                            updateStore((s) => {
                              const row = s.payslips.find((x) => x.id === p.id);
                              if (row) row.gross = v;
                              return s;
                            });
                            refresh();
                          }} style={{ width: 100, padding: "4px 8px", borderRadius: 6, border: `1px solid ${tk.border}`, background: tk.card, color: tk.text, fontSize: 12 }} />
                        ) : fmtPKR(p.gross)}
                      </td>
                      <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono',monospace", color: tk.red, fontSize: 11 }}>
                        Tax {fmtPKR(p.deductions?.tax)} · Late {fmtPKR(p.deductions?.late)} · Leave {fmtPKR(p.deductions?.leave)} · Adv {fmtPKR(p.deductions?.advance)}
                      </td>
                      <td style={{ padding: "11px 14px", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: tk.gold }}>
                        {manualEdit && user?.role === "admin" ? (
                          <input type="number" value={p.net} onChange={(e) => {
                            const v = Number(e.target.value);
                            updateStore((s) => {
                              const row = s.payslips.find((x) => x.id === p.id);
                              if (row) row.net = v;
                              return s;
                            });
                            refresh();
                          }} style={{ width: 100, padding: "4px 8px", borderRadius: 6, border: `1px solid ${tk.border}`, background: tk.card, color: tk.gold, fontSize: 12, fontWeight: 600 }} />
                        ) : fmtPKR(p.net)}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <Btn variant="ghost" size="sm" onClick={() => printPayslipPDF(p, u, store, fmtPKR, fmtDate)}>Payslip PDF</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function LocationPunchBadge({ punch, tk }) {
  if (!punch) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: punch.withinFence ? tk.green : tk.orange }}>
      <MapPin size={10} />
      {punch.withinFence ? "On-site" : "Off-site"}
    </span>
  );
}

export function AdvanceExportBar({ store, fmtPKR, Btn }) {
  return (
    <Btn variant="secondary" size="sm" onClick={() => exportAdvanceReport(store, fmtPKR)}>
      <Download size={13} /> Export Advance CSV
    </Btn>
  );
}
