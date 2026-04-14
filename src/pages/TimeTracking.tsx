import { useState, useMemo } from 'react';
import type { AppData, TimeEntry, TimeSheet, TimeSheetRow } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DOW = ['mon','tue','wed','thu','fri','sat','sun'] as const;
type Dow = typeof DOW[number];
const DOW_LABELS: Record<Dow, string> = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };

/** Returns YYYY-MM-DD for the Monday of the ISO week containing `date`. */
function weekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function addDays(yyyymmdd: string, n: number): string {
  const d = new Date(yyyymmdd + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function blankRow(data: AppData): TimeSheetRow {
  return {
    id: `tsr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    employeeId: data.employees[0]?.id ?? '',
    employeeName: data.employees[0]?.name ?? '',
    jobId: '',
    jobName: 'General / Admin',
    costCodeId: '',
    mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0,
  };
}

// ─── Weekly Entry Tab ─────────────────────────────────────────────────────────
function WeeklyEntryTab({ data, setData }: Props) {
  const [weekStart, setWeekStart] = useState(() => weekMonday(new Date()));
  const [rows,      setRows]      = useState<TimeSheetRow[]>([blankRow(data)]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  const jobOptions = [
    ...data.jobs.map(j => ({ id: j.id, label: `${j.jobNumber} · ${j.clientName}` })),
    ...data.contracts.filter(c => !data.jobs.find(j => j.contractId === c.id)).map(c => ({ id: c.id, label: c.clientName })),
    { id: '', label: 'General / Admin' },
  ];

  const laborCodes = data.accountingCodes.filter(a => a.code.startsWith('01-'));

  function updateRow(idx: number, patch: Partial<TimeSheetRow>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function handleEmpChange(idx: number, empId: string) {
    const emp = data.employees.find(e => e.id === empId);
    updateRow(idx, { employeeId: empId, employeeName: emp?.name ?? '' });
  }

  function handleJobChange(idx: number, jobId: string) {
    const job = jobOptions.find(j => j.id === jobId);
    updateRow(idx, { jobId, jobName: job?.label ?? 'General / Admin' });
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, {
      ...blankRow(data),
      id: `tsr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      employeeId: last?.employeeId ?? '',
      employeeName: last?.employeeName ?? '',
      jobId: last?.jobId ?? '',
      jobName: last?.jobName ?? 'General / Admin',
      costCodeId: last?.costCodeId ?? '',
    }]);
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  function rowTotal(row: TimeSheetRow) {
    return DOW.reduce((s, d) => s + (row[d] || 0), 0);
  }

  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  function submit() {
    if (!rows.some(r => rowTotal(r) > 0)) {
      alert('Enter at least one hour before submitting.'); return;
    }
    setSubmitting(true);
    const sheet: TimeSheet = {
      id: `ts_${Date.now()}`,
      weekStart,
      submittedBy: 'Admin',
      submittedAt: new Date().toISOString(),
      status: 'pending',
      rows,
    };
    const updated = { ...data, timeSheets: [...(data.timeSheets ?? []), sheet] };
    setData(updated); saveData(updated);
    setSubmitting(false);
    setSubmitted(true);
    setRows([blankRow(data)]);
    setTimeout(() => setSubmitted(false), 4000);
  }

  const weekDates = DOW.map((_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-4">
      {/* Week picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="label">Week of</label>
          <input
            type="date"
            className="input max-w-xs"
            value={weekStart}
            onChange={e => setWeekStart(weekMonday(new Date(e.target.value + 'T12:00:00')))}
          />
        </div>
        <div className="flex gap-1 mt-5">
          <button className="btn-secondary text-xs px-3 py-1" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
          <button className="btn-secondary text-xs px-3 py-1" onClick={() => setWeekStart(weekMonday(new Date()))}>This Week</button>
          <button className="btn-secondary text-xs px-3 py-1" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        </div>
        <div className="ml-auto text-right mt-5">
          <p className="text-xs text-gray-400">Week total</p>
          <p className="text-xl font-bold text-gray-900">{grandTotal.toFixed(1)} hrs</p>
        </div>
      </div>

      {submitted && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-semibold">
          ✓ Timesheet submitted and sent to Approvals.
        </div>
      )}

      {/* Grid */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-36">Employee</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-40">Job</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 w-32">Cost Code</th>
              {DOW.map((d, i) => (
                <th key={d} className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500 w-16">
                  <p>{DOW_LABELS[d]}</p>
                  <p className="text-gray-300 font-normal text-[10px]">{weekDates[i].slice(5)}</p>
                </th>
              ))}
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 w-16">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-2 py-1.5">
                  <select
                    className="input text-xs py-1"
                    value={row.employeeId}
                    onChange={e => handleEmpChange(idx, e.target.value)}
                  >
                    {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className="input text-xs py-1"
                    value={row.jobId ?? ''}
                    onChange={e => handleJobChange(idx, e.target.value)}
                  >
                    {jobOptions.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className="input text-xs py-1"
                    value={row.costCodeId ?? ''}
                    onChange={e => updateRow(idx, { costCodeId: e.target.value })}
                  >
                    <option value="">No code</option>
                    {laborCodes.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                  </select>
                </td>
                {DOW.map(d => (
                  <td key={d} className="px-1 py-1.5 text-center">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      className="input text-xs py-1 text-center w-14"
                      value={row[d] || ''}
                      placeholder="0"
                      onChange={e => updateRow(idx, { [d]: Number(e.target.value) })}
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-semibold text-gray-800 text-xs">{rowTotal(row).toFixed(1)}</td>
                <td className="px-1 py-1.5 text-center">
                  <button className="text-gray-300 hover:text-red-400 text-lg leading-none" onClick={() => removeRow(idx)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td colSpan={3} className="px-3 py-2">
                <button className="text-xs text-[#27AE60] hover:underline font-semibold" onClick={addRow}>+ Add Row</button>
              </td>
              {DOW.map(d => (
                <td key={d} className="px-1 py-2 text-center text-xs font-semibold text-gray-600">
                  {rows.reduce((s, r) => s + (r[d] || 0), 0).toFixed(1)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-bold text-gray-800 text-sm">{grandTotal.toFixed(1)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <button className="btn-secondary" onClick={() => setRows([blankRow(data)])}>Clear</button>
        <button className="btn-primary px-6" onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit for Approval →'}
        </button>
      </div>
    </div>
  );
}

// ─── Approvals Tab ────────────────────────────────────────────────────────────
function ApprovalsTab({ data, setData }: Props) {
  const [viewSheet, setViewSheet] = useState<TimeSheet | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const pending  = (data.timeSheets ?? []).filter(s => s.status === 'pending');
  const reviewed = (data.timeSheets ?? []).filter(s => s.status !== 'pending')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  function approve(sheet: TimeSheet) {
    // Create locked TimeEntry records from the sheet rows
    const newEntries: TimeEntry[] = [];
    sheet.rows.forEach(row => {
      DOW.forEach((d, i) => {
        const hrs = row[d] || 0;
        if (hrs <= 0) return;
        const entryDate = addDays(sheet.weekStart, i);
        newEntries.push({
          id: `te_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          date: entryDate,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          jobType: 'contract',
          jobId: row.jobId || undefined,
          jobName: row.jobName,
          costCodeId: row.costCodeId || undefined,
          hours: hrs,
          notes: '',
          createdAt: new Date().toISOString(),
          timesheetId: sheet.id,
          source: 'timesheet',
        });
      });
    });

    const updatedSheet: TimeSheet = {
      ...sheet,
      status: 'approved',
      approvedBy: 'Admin',
      approvedAt: new Date().toISOString(),
    };

    const updated = {
      ...data,
      timeSheets: (data.timeSheets ?? []).map(s => s.id === sheet.id ? updatedSheet : s),
      timeEntries: [...data.timeEntries, ...newEntries],
    };
    setData(updated); saveData(updated);
    setViewSheet(null);
  }

  function reject(sheet: TimeSheet, notes: string) {
    const updatedSheet: TimeSheet = {
      ...sheet,
      status: 'rejected',
      approvedBy: 'Admin',
      approvedAt: new Date().toISOString(),
      rejectionNotes: notes,
    };
    const updated = { ...data, timeSheets: (data.timeSheets ?? []).map(s => s.id === sheet.id ? updatedSheet : s) };
    setData(updated); saveData(updated);
    setRejectTarget(null);
    setRejectNotes('');
    setViewSheet(null);
  }

  function rowTotal(row: TimeSheetRow) { return DOW.reduce((s, d) => s + (row[d] || 0), 0); }
  function sheetTotal(sheet: TimeSheet) { return sheet.rows.reduce((s, r) => s + rowTotal(r), 0); }

  const STATUS_BADGE: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      {/* Pending */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Pending Approval ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <div className="card text-center py-8 text-gray-400 text-sm">No timesheets awaiting approval.</div>
        ) : (
          <div className="space-y-2">
            {pending.map(sheet => (
              <div key={sheet.id} className="card flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-900">
                    Week of {fmtDate(sheet.weekStart)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Submitted {new Date(sheet.submittedAt).toLocaleDateString()} by {sheet.submittedBy} ·
                    {' '}{sheet.rows.length} rows · {sheetTotal(sheet).toFixed(1)} hrs
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="btn-secondary text-sm px-3 py-1" onClick={() => setViewSheet(sheet)}>Review</button>
                  <button className="btn-primary text-sm px-3 py-1 bg-green-600 border-green-600" onClick={() => approve(sheet)}>✓ Approve</button>
                  <button className="text-sm px-3 py-1 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                    onClick={() => { setRejectTarget(sheet.id); setViewSheet(sheet); }}>
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {reviewed.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Review History</h3>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Week','Submitted','Rows','Total Hours','Status',''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviewed.map(sheet => (
                  <tr key={sheet.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">Week of {fmtDate(sheet.weekStart)}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{new Date(sheet.submittedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-gray-600">{sheet.rows.length}</td>
                    <td className="px-4 py-2.5 font-semibold">{sheetTotal(sheet).toFixed(1)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[sheet.status] ?? ''}`}>
                        {sheet.status}
                      </span>
                      {sheet.rejectionNotes && (
                        <span className="text-xs text-red-500 ml-2 italic">{sheet.rejectionNotes}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button className="text-xs text-[#27AE60] hover:underline" onClick={() => setViewSheet(sheet)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {viewSheet && (
        <Modal
          title={`Timesheet — Week of ${fmtDate(viewSheet.weekStart)}`}
          onClose={() => { setViewSheet(null); setRejectTarget(null); }}
          size="lg"
        >
          <div className="space-y-4">
            <div className="text-xs text-gray-500">
              Submitted {new Date(viewSheet.submittedAt).toLocaleDateString()} by {viewSheet.submittedBy}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-2 py-2">Employee</th>
                    <th className="text-left px-2 py-2">Job</th>
                    {DOW.map(d => <th key={d} className="text-center px-2 py-2">{DOW_LABELS[d]}</th>)}
                    <th className="text-right px-2 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {viewSheet.rows.map(row => (
                    <tr key={row.id}>
                      <td className="px-2 py-1.5 font-medium">{row.employeeName}</td>
                      <td className="px-2 py-1.5 text-gray-600">{row.jobName}</td>
                      {DOW.map(d => <td key={d} className="px-2 py-1.5 text-center">{row[d] > 0 ? row[d] : '—'}</td>)}
                      <td className="px-2 py-1.5 text-right font-bold">{rowTotal(row).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold bg-gray-50">
                    <td colSpan={2} className="px-2 py-2">Total</td>
                    {DOW.map(d => (
                      <td key={d} className="px-2 py-2 text-center">
                        {viewSheet.rows.reduce((s, r) => s + (r[d] || 0), 0).toFixed(1)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right">{sheetTotal(viewSheet).toFixed(1)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {rejectTarget === viewSheet.id && (
              <div className="space-y-2">
                <label className="label text-red-600">Rejection Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  placeholder="Explain why this is being rejected..."
                />
              </div>
            )}

            {viewSheet.status === 'pending' ? (
              <div className="flex gap-3 pt-2 border-t">
                {rejectTarget === viewSheet.id ? (
                  <>
                    <button className="btn-primary flex-1 bg-red-600 border-red-600" onClick={() => reject(viewSheet, rejectNotes)}>
                      Confirm Reject
                    </button>
                    <button className="btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn-primary flex-1" onClick={() => approve(viewSheet)}>✓ Approve</button>
                    <button className="text-sm px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => setRejectTarget(viewSheet.id)}>
                      ✕ Reject
                    </button>
                    <button className="btn-secondary" onClick={() => setViewSheet(null)}>Close</button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex gap-3 pt-2 border-t">
                <span className={`text-sm px-3 py-2 rounded-xl font-semibold ${
                  viewSheet.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {viewSheet.status === 'approved' ? '✓ Approved' : '✕ Rejected'}
                  {viewSheet.approvedAt ? ` on ${new Date(viewSheet.approvedAt).toLocaleDateString()}` : ''}
                </span>
                <button className="btn-secondary ml-auto" onClick={() => setViewSheet(null)}>Close</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Logged Hours Tab ─────────────────────────────────────────────────────────
function LoggedHoursTab({ data, setData }: Props) {
  const [pushingId, setPushingId] = useState<string | null>(null);

  // Collect all logged visits across all jobs
  const loggedVisits = useMemo(() => {
    return data.jobs.flatMap(job =>
      (job.visitLogs ?? [])
        .filter(l => l.status === 'logged')
        .map(log => ({ job, log }))
    ).sort((a, b) => b.log.visitDate.localeCompare(a.log.visitDate));
  }, [data.jobs]);

  const pushedVisits = useMemo(() => {
    return data.jobs.flatMap(job =>
      (job.visitLogs ?? [])
        .filter(l => l.status === 'pushed')
        .map(log => ({ job, log }))
    ).sort((a, b) => b.log.visitDate.localeCompare(a.log.visitDate));
  }, [data.jobs]);

  function pushToTimeTracking(jobId: string, logId: string) {
    setPushingId(logId);
    const job = data.jobs.find(j => j.id === jobId);
    const log = job?.visitLogs?.find(l => l.id === logId);
    if (!job || !log) { setPushingId(null); return; }

    // Calculate hours from start/end time
    let hrs = 0;
    if (log.startTime && log.endTime) {
      const [sh, sm] = log.startTime.split(':').map(Number);
      const [eh, em] = log.endTime.split(':').map(Number);
      hrs = Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
    } else {
      hrs = job.hoursPerVisit || 0;
    }

    // Create one TimeEntry per employee in the visit
    const empIds = log.employeeIds.length > 0 ? log.employeeIds : (
      job.crewId ? (data.crews.find(c => c.id === job.crewId)?.memberIds ?? []) : []
    );

    const newEntries: TimeEntry[] = empIds.map(empId => {
      const emp = data.employees.find(e => e.id === empId);
      return {
        id: `te_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        date: log.visitDate,
        employeeId: empId,
        employeeName: emp?.name ?? empId,
        jobType: 'contract' as const,
        jobId: job.id,
        jobName: `${job.jobNumber} · ${job.clientName}`,
        hours: hrs,
        notes: log.notes || `Visit log ${log.visitDate}`,
        createdAt: new Date().toISOString(),
        source: 'visit_log' as const,
      };
    });

    // Mark log as pushed
    const updatedJob = {
      ...job,
      visitLogs: job.visitLogs.map(l => l.id === logId ? { ...l, status: 'pushed' as const } : l),
    };

    const updated = {
      ...data,
      jobs: data.jobs.map(j => j.id === job.id ? updatedJob : j),
      timeEntries: [...data.timeEntries, ...newEntries],
    };
    setData(updated); saveData(updated);
    setPushingId(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Pending Push ({loggedVisits.length})
        </h3>
        {loggedVisits.length === 0 ? (
          <div className="card text-center py-8 text-gray-400 text-sm">
            No logged visits pending. Log visits from a job's Schedule tab.
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Visit Date','Job','Crew / Employees','Time','Photos','Notes',''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loggedVisits.map(({ job, log }) => {
                  const empNames = log.employeeIds
                    .map(id => data.employees.find(e => e.id === id)?.name ?? id)
                    .join(', ');
                  const timeStr = (log.startTime && log.endTime)
                    ? `${log.startTime}–${log.endTime}`
                    : '—';
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{log.visitDate}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-gray-800">{job.jobNumber}</p>
                        <p className="text-xs text-gray-400">{job.clientName}</p>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{empNames || log.crewName || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{timeStr}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{log.photos?.length || 0}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">{log.notes || '—'}</td>
                      <td className="px-4 py-2.5">
                        <button
                          className="btn-primary text-xs px-3 py-1"
                          disabled={pushingId === log.id}
                          onClick={() => pushToTimeTracking(job.id, log.id)}
                        >
                          {pushingId === log.id ? '…' : 'Push →'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pushedVisits.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Already Pushed ({pushedVisits.length})
          </h3>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Visit Date','Job','Employees','Time','Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pushedVisits.slice(0, 20).map(({ job, log }) => {
                  const empNames = log.employeeIds
                    .map(id => data.employees.find(e => e.id === id)?.name ?? id)
                    .join(', ');
                  return (
                    <tr key={log.id} className="opacity-70">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{log.visitDate}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{job.jobNumber} · {job.clientName}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{empNames || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {log.startTime && log.endTime ? `${log.startTime}–${log.endTime}` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ Pushed</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── All Entries Tab ──────────────────────────────────────────────────────────
function AllEntriesTab({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<TimeEntry | null>(null);
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterJob, setFilterJob] = useState('all');
  const [form, setForm] = useState<Omit<TimeEntry, 'id' | 'createdAt'>>({
    date: new Date().toISOString().split('T')[0],
    employeeId: data.employees[0]?.id ?? '',
    employeeName: data.employees[0]?.name ?? '',
    jobType: 'contract',
    jobId: '',
    jobName: 'General / Admin',
    hours: 0,
    notes: '',
    source: 'manual',
  });

  const blendedRate = data.settings.laborRatePerHour;

  const jobOptions = [
    ...data.jobs.map(j => ({ id: j.id, label: `${j.jobNumber} · ${j.clientName}`, type: 'contract' as const })),
    { id: '', label: 'General / Admin', type: 'general' as const },
  ];

  function open(e?: TimeEntry) {
    if (e) { setEditing(e); setForm({ ...e }); }
    else {
      setEditing(null);
      setForm({
        date: new Date().toISOString().split('T')[0],
        employeeId: data.employees[0]?.id ?? '',
        employeeName: data.employees[0]?.name ?? '',
        jobType: 'contract',
        jobId: '',
        jobName: 'General / Admin',
        hours: 0,
        notes: '',
        source: 'manual',
      });
    }
    setShowModal(true);
  }

  function save() {
    if (!form.employeeId) { alert('Select an employee'); return; }
    if (!form.hours || form.hours <= 0) { alert('Enter hours greater than 0'); return; }
    let updated: AppData;
    if (editing) {
      updated = { ...data, timeEntries: data.timeEntries.map(t => t.id === editing.id ? { ...editing, ...form } : t) };
    } else {
      updated = { ...data, timeEntries: [...data.timeEntries, { id: `te_${Date.now()}`, ...form, createdAt: new Date().toISOString() }] };
    }
    setData(updated); saveData(updated); setShowModal(false);
  }

  function del(id: string) {
    if (!confirm('Delete this time entry?')) return;
    const updated = { ...data, timeEntries: data.timeEntries.filter(t => t.id !== id) };
    setData(updated); saveData(updated);
  }

  const filtered = data.timeEntries.filter(t => {
    if (filterEmp !== 'all' && t.employeeId !== filterEmp) return false;
    if (filterJob !== 'all' && t.jobId !== filterJob) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const SOURCE_BADGE: Record<string, string> = {
    manual: 'text-gray-400', timesheet: 'text-blue-500', visit_log: 'text-green-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <select className="input max-w-xs" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="all">All Employees</option>
          {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className="input max-w-xs" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {data.jobs.map(j => <option key={j.id} value={j.id}>{j.jobNumber} · {j.clientName}</option>)}
        </select>
        <button className="btn-primary ml-auto" onClick={() => open()}>+ Manual Entry</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Date','Employee','Job','Cost Code','Hrs','Cost','Source','Notes',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">No entries yet.</td></tr>
            ) : filtered.map(t => {
              const emp  = data.employees.find(e => e.id === t.employeeId);
              const cost = t.hours * (emp?.hourlyRate ?? blendedRate);
              const code = t.costCodeId ? data.accountingCodes.find(a => a.id === t.costCodeId) : null;
              return (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.employeeName}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{t.jobName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{code ? code.code : '—'}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{t.hours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-amber-600">{formatCurrency(cost)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${SOURCE_BADGE[t.source ?? 'manual']}`}>
                      {t.source === 'visit_log' ? 'Visit Log' : t.source === 'timesheet' ? 'Timesheet' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{t.notes}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(t)}>Edit</button>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => del(t.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold text-sm">
                <td colSpan={4} className="px-4 py-2 text-gray-600">Total</td>
                <td className="px-4 py-2 text-gray-900">{filtered.reduce((s,t) => s+t.hours,0).toFixed(1)} hrs</td>
                <td className="px-4 py-2 text-amber-600">
                  {formatCurrency(filtered.reduce((s,t) => {
                    const emp = data.employees.find(e => e.id === t.employeeId);
                    return s + t.hours * (emp?.hourlyRate ?? blendedRate);
                  }, 0))}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Entry' : 'Manual Time Entry'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
              <div>
                <label className="label">Hours</label>
                <input className="input" type="number" step="0.25" value={form.hours || ''} onChange={e => setForm({...form, hours: Number(e.target.value)})} />
              </div>
              <div>
                <label className="label">Employee</label>
                <select className="input" value={form.employeeId} onChange={e => {
                  const emp = data.employees.find(e2 => e2.id === e.target.value);
                  setForm({...form, employeeId: e.target.value, employeeName: emp?.name ?? ''});
                }}>
                  {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Job</label>
                <select className="input" value={form.jobId ?? ''} onChange={e => {
                  const job = jobOptions.find(j => j.id === e.target.value);
                  setForm({...form, jobId: job?.id || undefined, jobName: job?.label ?? 'General / Admin', jobType: job?.type ?? 'general'});
                }}>
                  {jobOptions.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="What was done..." />
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={save}>Save Entry</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type Tab = 'weekly' | 'logged' | 'approvals' | 'entries';

export default function TimeTracking({ data, setData }: Props) {
  const [tab, setTab] = useState<Tab>('weekly');

  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const thisMonthEntries = data.timeEntries.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const totalHoursMonth = thisMonthEntries.reduce((s, t) => s + t.hours, 0);
  const blendedRate     = data.settings.laborRatePerHour;
  const laborCostMonth  = totalHoursMonth * blendedRate;
  const pendingCount    = (data.timeSheets ?? []).filter(s => s.status === 'pending').length;
  const loggedCount     = data.jobs.reduce((s, j) => s + (j.visitLogs ?? []).filter(l => l.status === 'logged').length, 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'weekly',    label: 'Weekly Entry' },
    { key: 'logged',    label: `Logged Hours${loggedCount > 0 ? ` (${loggedCount})` : ''}` },
    { key: 'approvals', label: `Approvals${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'entries',   label: 'All Entries' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Time Tracking"
        subtitle="Submit weekly timesheets, review logged visits, approve hours"
      />

      {/* Month stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Hours This Month</p>
          <p className="text-3xl font-bold text-gray-900">{totalHoursMonth.toFixed(1)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Labor Cost This Month</p>
          <p className="text-3xl font-bold text-amber-600">{formatCurrency(laborCostMonth)}</p>
          <p className="text-xs text-gray-400">${blendedRate}/hr blended</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Approved Entries</p>
          <p className="text-3xl font-bold text-gray-900">{data.timeEntries.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-200 mb-5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-[#27AE60] text-[#27AE60]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'weekly'    && <WeeklyEntryTab    data={data} setData={setData} />}
      {tab === 'logged'    && <LoggedHoursTab    data={data} setData={setData} />}
      {tab === 'approvals' && <ApprovalsTab      data={data} setData={setData} />}
      {tab === 'entries'   && <AllEntriesTab     data={data} setData={setData} />}
    </div>
  );
}
