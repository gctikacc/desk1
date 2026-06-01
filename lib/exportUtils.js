/**
 * CSV / export helpers — preserves filters via metadata
 */

export const downloadTextFile = (filename, content, mime = "text/csv;charset=utf-8") => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const toCSV = (rows, headers) => {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  rows.forEach((r) => lines.push(headers.map((h) => esc(r[h])).join(",")));
  return lines.join("\n");
};

export const exportAdvanceReport = (store, fmtPKR) => {
  const rows = (store.advanceSalaryRequests || [])
    .filter((r) => !r.deletedAt)
    .map((r) => {
      const u = store.users.find((x) => x.id === r.userId);
      return {
        staff: u?.name || r.userId,
        status: r.status,
        requested: r.requestedAmount,
        approved: r.approvedAmount ?? "",
        monthly: r.monthlyDeduction,
        remaining: r.remainingBalance,
        reason: r.reason,
        applied: r.appliedOn,
      };
    });
  const csv = toCSV(rows, ["staff", "status", "requested", "approved", "monthly", "remaining", "reason", "applied"]);
  downloadTextFile(`advance-salary-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
};

export const exportPayrollReport = (store, month) => {
  const rows = (store.payslips || [])
    .filter((p) => p.month === month && !p.deletedAt)
    .map((p) => {
      const u = store.users.find((x) => x.id === p.userId);
      return {
        staff: u?.name || p.userId,
        month: p.month,
        gross: p.gross,
        net: p.net,
        tax: p.deductions?.tax || 0,
        advance: p.deductions?.advance || 0,
        present: p.attendanceSummary?.present || 0,
      };
    });
  const csv = toCSV(rows, ["staff", "month", "gross", "net", "tax", "advance", "present"]);
  downloadTextFile(`payroll-${month}.csv`, csv);
};

export const exportAttendanceReport = (store, month) => {
  const rows = (store.attendance || [])
    .filter((a) => a.date.startsWith(month))
    .map((a) => {
      const u = store.users.find((x) => x.id === a.userId);
      return {
        staff: u?.name || a.userId,
        date: a.date,
        in: a.inTime || "",
        out: a.outTime || "",
        status: a.status,
        late: a.late ? "yes" : "no",
        half: a.halfDay ? "yes" : "no",
        overtime: a.overtime || 0,
      };
    });
  const csv = toCSV(rows, ["staff", "date", "in", "out", "status", "late", "half", "overtime"]);
  downloadTextFile(`attendance-${month}.csv`, csv);
};

const fmtMoney = (n) => `PKR ${Number(n || 0).toLocaleString("en-PK")}`;

export const printPayslipPDF = (slip, user, store, fmtPKR, fmtDate) => {
  const w = window.open("", "_blank");
  if (!w) return;
  const company = store.settings?.companyName || "Alvin Desk";
  const earn = slip.earnings || {};
  const ded = slip.deductions || {};
  const sum = slip.attendanceSummary || {};
  const earnRows = [
    ["Base salary", earn.salary ?? (earn.basic || 0) + (earn.hra || 0) + (earn.transport || 0) + (earn.medical || 0)],
    ["Bonus", earn.bonus || 0],
    ["Overtime", earn.overtime || 0],
  ].filter(([, v]) => Number(v) > 0);
  const dedRows = [
    ["Tax", ded.tax || 0],
    ["Leave / unpaid", ded.leave || 0],
    ["Late deduction", ded.late || 0],
    ["Advance", ded.advance || 0],
    ["Other", ded.other || 0],
  ].filter(([, v]) => Number(v) > 0);
  const gold = "#b45309";
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Payslip — ${user?.name}</title>
  <style>
    @page{margin:18mm}
    body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a1a;padding:0;margin:0;background:#faf8f5}
    .wrap{max-width:720px;margin:0 auto;padding:32px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${gold};padding-bottom:16px;margin-bottom:24px}
    .brand{font-family:Georgia,serif;font-size:28px;font-weight:700;color:${gold};letter-spacing:0.02em}
    .sub{font-size:12px;color:#666;margin-top:4px}
    .badge{display:inline-block;background:${gold};color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;margin-top:8px}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:0.08em;color:#666;margin:20px 0 10px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e8e4de}
    th{font-size:10px;text-transform:uppercase;color:#888;font-weight:600}
    td.amt{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
    .net{margin-top:20px;padding:16px 18px;background:linear-gradient(135deg,#fff9e6,#fff);border:2px solid ${gold};border-radius:10px;display:flex;justify-content:space-between;align-items:center}
    .net strong{font-size:22px;color:${gold}}
    .foot{margin-top:32px;font-size:10px;color:#999;text-align:center;border-top:1px solid #e8e4de;padding-top:12px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
    .pill{background:#fff;border:1px solid #e8e4de;border-radius:8px;padding:10px;text-align:center;font-size:11px}
    .pill b{display:block;font-size:16px;color:#111;margin-top:4px}
  </style></head><body><div class="wrap">
  <div class="head">
    <div>
      <div class="brand">${company}</div>
      <div class="sub">Official Payslip · Confidential</div>
      <span class="badge">${slip.month}</span>
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:600">${user?.name || "—"}</div>
      <div class="sub">${user?.email || ""}</div>
      <div class="sub">Generated ${new Date().toLocaleDateString("en-PK")}</div>
    </div>
  </div>
  <div class="grid">
    <div class="pill">Present<b>${sum.present ?? "—"}</b></div>
    <div class="pill">Leave<b>${sum.leave ?? "—"}</b></div>
    <div class="pill">Late<b>${sum.late ?? sum.lateMin ?? "—"}</b></div>
    <div class="pill">OT (min)<b>${sum.overtime ?? "—"}</b></div>
  </div>
  <h2>Earnings</h2>
  <table><thead><tr><th>Description</th><th style="text-align:right">Amount (PKR)</th></tr></thead><tbody>
  ${earnRows.map(([k, v]) => `<tr><td>${k}</td><td class="amt">${Number(v).toLocaleString("en-PK")}</td></tr>`).join("")}
  <tr><td><strong>Gross</strong></td><td class="amt"><strong>${fmtPKR(slip.gross)}</strong></td></tr>
  </tbody></table>
  <h2>Deductions</h2>
  <table><tbody>
  ${dedRows.map(([k, v]) => `<tr><td>${k}</td><td class="amt">${Number(v).toLocaleString("en-PK")}</td></tr>`).join("")}
  </tbody></table>
  <div class="net"><span>Net pay</span><strong>${fmtPKR(slip.net)}</strong></div>
  <div class="foot">Alvin Desk · ${company} · This document is system-generated. For queries contact HR.</div>
  </div></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
};

export const downloadAllPayslips = (store, month, fmtPKR, fmtDate) => {
  const slips = (store.payslips || []).filter((p) => p.month === month && !p.deletedAt);
  if (!slips.length) return { ok: false, error: "No payslips for this month" };
  slips.forEach((p, i) => {
    const u = store.users.find((x) => x.id === p.userId);
    setTimeout(() => printPayslipPDF(p, u, store, fmtPKR, fmtDate), i * 600);
  });
  return { ok: true, count: slips.length };
};
