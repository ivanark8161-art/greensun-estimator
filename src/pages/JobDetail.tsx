import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  AppData, Job, CostCodeCategory, Invoice, VisitLog, VisitPhoto,
} from '../types';
import { COST_CODE_LABELS } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency, formatPercent } from '../utils/calculations';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

type DetailTab = 'overview' | 'schedule' | 'invoices' | 'projection' | 'details';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtDec(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Schedule visit generator ─────────────────────────────────────────────────
interface Visit {
  date: Date;
  dateStr: string;
  status: 'completed' | 'upcoming' | 'today';
  isPast: boolean;
}

function generateVisits(job: Job, contract: { scheduledDay?: number; visitsPerMonth?: number } | null): Visit[] {
  if (!job.startDate) return [];
  const start = new Date(job.startDate + 'T12:00:00');
  const end   = job.endDate ? new Date(job.endDate + 'T12:00:00') : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  const today = new Date(); today.setHours(0,0,0,0);

  // Determine day of week (0=Sun..6=Sat). Use contract's scheduledDay if set, else Saturday.
  const dow = contract?.scheduledDay ?? 6;

  // Walk from start to end, collecting every occurrence of that DOW
  const visits: Visit[] = [];
  const cur = new Date(start);
  // Advance to first matching DOW
  while (cur.getDay() !== dow) cur.setDate(cur.getDate() + 1);

  while (cur <= end) {
    const d = new Date(cur);
    d.setHours(0,0,0,0);
    const dateStr = cur.toISOString().split('T')[0];
    const isToday = d.getTime() === today.getTime();
    visits.push({
      date: new Date(cur),
      dateStr,
      isPast: d < today,
      status: isToday ? 'today' : d < today ? 'completed' : 'upcoming',
    });
    cur.setDate(cur.getDate() + 7);
  }
  return visits;
}

// ─── Log Visit Modal ──────────────────────────────────────────────────────────
function LogVisitModal({
  visitDate, job, data, existingLog, onSave, onClose,
}: {
  visitDate: string;
  job: Job;
  data: AppData;
  existingLog: VisitLog | null;
  onSave: (log: VisitLog) => void;
  onClose: () => void;
}) {
  const defaultCrew   = job.crewId ? data.crews.find(c => c.id === job.crewId) : null;
  const defaultMemIds = defaultCrew?.memberIds ?? [];

  const [crewId,      setCrewId]      = useState(existingLog?.crewId      ?? job.crewId ?? '');
  const [empIds,      setEmpIds]      = useState<string[]>(existingLog?.employeeIds ?? defaultMemIds);
  const [startTime,   setStartTime]   = useState(existingLog?.startTime   ?? '');
  const [endTime,     setEndTime]     = useState(existingLog?.endTime     ?? '');
  const [notes,       setNotes]       = useState(existingLog?.notes       ?? '');
  const [photos,      setPhotos]      = useState<VisitPhoto[]>(existingLog?.photos ?? []);
  const [uploading,   setUploading]   = useState(false);

  const selectedCrew = crewId ? data.crews.find(c => c.id === crewId) : null;
  const availableEmps = selectedCrew
    ? data.employees.filter(e => selectedCrew.memberIds.includes(e.id))
    : data.employees;

  function toggleEmp(id: string) {
    setEmpIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  }

  function handleCrewChange(id: string) {
    setCrewId(id);
    const crew = data.crews.find(c => c.id === id);
    if (crew) setEmpIds(crew.memberIds);
    else setEmpIds([]);
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    const readers = files.map(file => new Promise<VisitPhoto>(resolve => {
      const reader = new FileReader();
      reader.onload = ev => resolve({
        id: `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: file.name,
        dataUrl: ev.target?.result as string,
        caption: '',
        uploadedAt: new Date().toISOString(),
      });
      reader.readAsDataURL(file);
    }));
    Promise.all(readers).then(newPhotos => {
      setPhotos(prev => [...prev, ...newPhotos]);
      setUploading(false);
    });
    e.target.value = '';
  }

  function removePhoto(id: string) { setPhotos(p => p.filter(ph => ph.id !== id)); }

  function save() {
    const log: VisitLog = {
      id:          existingLog?.id ?? `vl_${Date.now()}`,
      visitDate,
      crewId:      crewId || undefined,
      crewName:    selectedCrew?.name,
      employeeIds: empIds,
      startTime:   startTime || undefined,
      endTime:     endTime || undefined,
      photos,
      notes,
      status:      existingLog?.status ?? 'logged',
      completedAt: existingLog?.completedAt ?? new Date().toISOString(),
    };
    onSave(log);
  }

  const hoursWorked = (() => {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? (mins / 60).toFixed(2) : null;
  })();

  return (
    <Modal title={`Log Visit — ${fmtDate(visitDate)}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Crew */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Crew</label>
            <select className="input" value={crewId} onChange={e => handleCrewChange(e.target.value)}>
              <option value="">No crew assigned</option>
              {data.crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={visitDate} readOnly />
          </div>
        </div>

        {/* Employees */}
        <div>
          <label className="label">Employees Who Completed This Visit</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {availableEmps.map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => toggleEmp(emp.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  empIds.includes(emp.id)
                    ? 'bg-[#27AE60] text-white border-[#27AE60]'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                }`}
              >
                {emp.name}
              </button>
            ))}
          </div>
        </div>

        {/* Times */}
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Start Time</label>
            <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="label">End Time</label>
            <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
          <div className="pb-1">
            {hoursWorked && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-sm text-center">
                <span className="font-bold text-green-700">{hoursWorked} hrs</span>
                <span className="text-green-600 text-xs ml-1">worked</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What was done, any issues..." />
        </div>

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Photos</label>
            <label className="btn-secondary text-xs px-3 py-1 cursor-pointer">
              {uploading ? 'Uploading…' : '+ Add Photos'}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
            </label>
          </div>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map(ph => (
                <div key={ph.id} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square">
                  <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(ph.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
          {photos.length === 0 && (
            <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-400">
              No photos yet. Click "+ Add Photos" to upload.
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2 border-t">
          <button className="btn-primary flex-1" onClick={save}>✓ Mark Complete &amp; Save</button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────
function ScheduleTab({
  job, data, updateJob, onNavigateSchedule,
}: {
  job: Job;
  data: AppData;
  updateJob: (j: Job) => void;
  onNavigateSchedule: () => void;
}) {
  const contract = data.contracts.find(c => c.id === job.contractId) ?? null;
  const crew     = job.crewId ? data.crews.find(c => c.id === job.crewId) : null;
  const members  = crew ? data.employees.filter(e => crew.memberIds.includes(e.id)) : [];
  const visits   = useMemo(() => generateVisits(job, contract), [job, contract]); // eslint-disable-line react-hooks/exhaustive-deps

  const [logTarget, setLogTarget] = useState<string | null>(null); // visitDate being logged
  const logTargetExisting = logTarget ? (job.visitLogs ?? []).find(l => l.visitDate === logTarget) ?? null : null;

  const today = new Date(); today.setHours(0,0,0,0);
  const past    = visits.filter(v => v.isPast);
  const future  = visits.filter(v => !v.isPast);
  const nextVisit = future[0];
  const logsById  = new Map((job.visitLogs ?? []).map(l => [l.visitDate, l]));

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function saveLog(log: VisitLog) {
    const existingLogs = (job.visitLogs ?? []).filter(l => l.visitDate !== log.visitDate);
    const wasAlreadyLogged = !!(job.visitLogs ?? []).find(l => l.visitDate === log.visitDate);

    // ── Equipment auto-charge ──────────────────────────────────────────────
    // Only charge on first log of each visit (not re-edits)
    let updatedCostCodes = job.costCodes;
    if (!wasAlreadyLogged) {
      // Resolve which crew/equipment to use
      const activeCrew = log.crewId
        ? data.crews.find(c => c.id === log.crewId)
        : crew;
      const equipIds = activeCrew?.equipmentIds ?? [];
      const visitCount = Math.max(job.visitsPerMonth, 1);

      // Per-visit depreciation cost = monthly depreciation / visits per month
      const perVisitEquipCost = equipIds.reduce((sum, eqId) => {
        const eq = data.equipment.find(e => e.id === eqId);
        return sum + (eq ? eq.monthlyDepreciation / visitCount : 0);
      }, 0);

      if (perVisitEquipCost > 0) {
        updatedCostCodes = job.costCodes.map(cc =>
          cc.category === 'equipment'
            ? { ...cc, actual: parseFloat((cc.actual + perVisitEquipCost).toFixed(2)) }
            : cc
        );
        // If no equipment cost code exists yet, add one
        if (!job.costCodes.find(cc => cc.category === 'equipment')) {
          updatedCostCodes = [...updatedCostCodes, {
            category: 'equipment' as const,
            budgeted: 0,
            actual: parseFloat(perVisitEquipCost.toFixed(2)),
            notes: '',
          }];
        }
      }
    }

    updateJob({
      ...job,
      visitLogs: [...existingLogs, log],
      costCodes: updatedCostCodes,
    });
    setLogTarget(null);
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Scheduled Day</p>
          <p className="text-lg font-bold text-gray-900">{contract?.scheduledDay !== undefined ? DAYS[contract.scheduledDay] : 'Not set'}</p>
          {contract?.scheduledTime && <p className="text-xs text-gray-400 mt-0.5">{contract.scheduledTime}</p>}
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Visits Logged</p>
          <p className="text-lg font-bold text-[#27AE60]">{(job.visitLogs ?? []).length}</p>
          <p className="text-xs text-gray-400">{past.length} past scheduled</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Next Visit</p>
          <p className="text-lg font-bold text-gray-900">{nextVisit ? fmtDateShort(nextVisit.date) : '—'}</p>
          {nextVisit && <p className="text-xs text-gray-400">{future.length} remaining</p>}
        </div>
      </div>

      {/* Crew */}
      {crew && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assigned Crew</p>
          <p className="font-semibold text-gray-900 mb-1">{crew.name}</p>
          <div className="flex flex-wrap gap-1">
            {members.map(m => (
              <span key={m.id} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                {m.name} <span className="opacity-60">— {m.role}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn-secondary text-sm" onClick={onNavigateSchedule}>
          Go to Full Schedule →
        </button>
      </div>

      {/* Upcoming visits */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming Visits ({future.length})</h3>
        {future.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No upcoming visits.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {future.slice(0, 24).map((v, i) => (
              <div key={v.dateStr} className={`rounded-xl border px-3 py-2 text-sm ${i === 0 ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
                <p className={`font-semibold ${i === 0 ? 'text-[#27AE60]' : 'text-gray-800'}`}>{fmtDateShort(v.date)}</p>
                {i === 0 && <p className="text-xs text-green-600 mt-0.5">Next visit</p>}
              </div>
            ))}
            {future.length > 24 && (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-400 text-center flex items-center justify-center">
                +{future.length - 24} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Past visits */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Past Visits ({past.length})</h3>
        {past.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No past visits yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {[...past].reverse().slice(0, 48).map(v => {
              const log = logsById.get(v.dateStr);
              return (
                <div key={v.dateStr} className={`rounded-xl border px-3 py-2 text-sm ${log ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`font-medium ${log ? 'text-green-800' : 'text-gray-600'}`}>{fmtDateShort(v.date)}</p>
                  {log ? (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-green-600 font-semibold">✓ Logged</span>
                      <button className="text-xs text-gray-400 hover:text-gray-600 underline" onClick={() => setLogTarget(v.dateStr)}>Edit</button>
                    </div>
                  ) : (
                    <button
                      className="mt-1 text-xs text-[#27AE60] font-semibold hover:underline"
                      onClick={() => setLogTarget(v.dateStr)}
                    >
                      + Log Visit
                    </button>
                  )}
                  {log?.startTime && log?.endTime && (
                    <p className="text-xs text-gray-400 mt-0.5">{log.startTime}–{log.endTime}</p>
                  )}
                  {log?.photos?.length ? <p className="text-xs text-gray-400">{log.photos.length} photo{log.photos.length > 1 ? 's' : ''}</p> : null}
                </div>
              );
            })}
            {past.length > 48 && (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-400 text-center flex items-center justify-center">
                +{past.length - 48} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log Visit Modal */}
      {logTarget && (
        <LogVisitModal
          visitDate={logTarget}
          job={job}
          data={data}
          existingLog={logTargetExisting}
          onSave={saveLog}
          onClose={() => setLogTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Invoice History Tab ──────────────────────────────────────────────────────
function InvoicesTab({ job, data, onViewInvoice }: { job: Job; data: AppData; onViewInvoice: (inv: Invoice) => void }) {
  const invoices = data.invoices.filter(i => i.contractId === job.contractId && i.status !== 'void');
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.paidAmount, 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  const STATUS_BADGE: Record<string, string> = {
    draft: 'badge-gray', sent: 'badge-yellow', paid: 'badge-green', overdue: 'badge-red', void: 'badge-gray',
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Total Invoiced</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalInvoiced)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Collected</p>
          <p className="text-xl font-bold text-[#27AE60]">{fmt(totalPaid)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Outstanding</p>
          <p className={`text-xl font-bold ${totalOutstanding > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{fmt(totalOutstanding)}</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-sm">No invoices for this job yet.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Invoice #','Issued','Due','Amount','Status',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...invoices].sort((a,b) => b.issuedDate.localeCompare(a.issuedDate)).map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onViewInvoice(inv)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-gray-700">{fmtDate(inv.issuedDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(inv.dueDate)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{fmtDec(inv.total)}</td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE[inv.status] ?? 'badge-gray'}>{inv.status}</span>
                    {inv.status === 'paid' && inv.paidDate && (
                      <span className="text-xs text-gray-400 ml-2">Paid {fmtDate(inv.paidDate)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-[#27AE60] hover:underline" onClick={e => { e.stopPropagation(); onViewInvoice(inv); }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Projection Tab ────────────────────────────────────────────────────────────
// Columns: Cost Code | Estimated (locked) | Budgeted (editable) | Actual (locked) | Remaining (Budgeted−Actual) | Projected (Actual+Remaining) | Variance (Estimated−Projected)
function ProjectionTab({ job, data, setData }: { job: Job; data: AppData; setData: (d: AppData) => void }) {
  const [budgetDraft, setBudgetDraft] = useState<Record<CostCodeCategory, number>>(
    Object.fromEntries(job.costCodes.map(c => [c.category, c.budgeted])) as Record<CostCodeCategory, number>
  );
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const contract = data.contracts.find(c => c.id === job.contractId);
  const estimatedRevenue = contract ? contract.annualRevenue ?? contract.subtotalRevenue : 0;

  // Build rows: Estimated comes from the original budgeted snapshot (locked at job creation)
  // The "Estimated" column = the original costCodes.budgeted values (never changes)
  // "Budgeted" = user-editable working budget (starts equal to estimated)
  const rows = job.costCodes.map(cc => {
    const budgeted   = editing ? budgetDraft[cc.category] ?? cc.budgeted : cc.budgeted;
    const actual     = cc.actual;
    const remaining  = Math.max(0, budgeted - actual);
    const projected  = actual + remaining;
    // Estimated = what was on the original quote (locked). We store it as budgeted initially,
    // but surface it separately. For now estimated === cc.budgeted (user hasn't changed budgeted).
    // Once user edits budgeted, estimated stays as original.
    return { category: cc.category, estimated: cc.budgeted, budgeted, actual, remaining, projected };
  });

  const totalEst       = rows.reduce((s, r) => s + r.estimated, 0);
  const totalBudgeted  = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual    = rows.reduce((s, r) => s + r.actual, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  const totalProjected = rows.reduce((s, r) => s + r.projected, 0);
  const totalVariance  = totalEst - totalProjected;

  const estMargin  = estimatedRevenue > 0 ? ((estimatedRevenue - totalEst) / estimatedRevenue) * 100 : 0;
  const projMargin = estimatedRevenue > 0 ? ((estimatedRevenue - totalProjected) / estimatedRevenue) * 100 : 0;

  function saveEdits() {
    const newCodes = job.costCodes.map(cc => ({
      ...cc,
      budgeted: budgetDraft[cc.category] ?? cc.budgeted,
    }));
    const updated = { ...data, jobs: data.jobs.map(j => j.id === job.id ? { ...j, costCodes: newCodes } : j) };
    setData(updated); saveData(updated);
    setEditing(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function cancelEdits() {
    setBudgetDraft(Object.fromEntries(job.costCodes.map(c => [c.category, c.budgeted])) as Record<CostCodeCategory, number>);
    setEditing(false);
  }

  const pctComplete = (() => {
    if (!job.startDate || !job.endDate) return 0;
    const start = new Date(job.startDate).getTime();
    const end   = new Date(job.endDate).getTime();
    const now   = Date.now();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.round(((now - start) / (end - start)) * 100);
  })();

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Job Progress</p>
          <p className="text-xl font-bold text-gray-900">{pctComplete}%</p>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
            <div className="bg-[#27AE60] h-1.5 rounded-full" style={{ width: `${pctComplete}%` }} />
          </div>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Est. Revenue</p>
          <p className="text-xl font-bold text-[#27AE60]">{fmt(estimatedRevenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Est. margin: {formatPercent(estMargin)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Projected Cost</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalProjected)}</p>
          <p className={`text-xs mt-0.5 ${projMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-red-500'}`}>
            Proj. margin: {formatPercent(projMargin)}
          </p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Variance (Est−Proj)</p>
          <p className={`text-xl font-bold ${totalVariance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {totalVariance >= 0 ? '+' : ''}{fmt(totalVariance)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{totalVariance >= 0 ? 'Under budget' : 'Over budget'}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cost Code Projection</h3>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">Saved ✓</span>}
            {editing ? (
              <>
                <button className="btn-secondary text-sm px-3 py-1" onClick={cancelEdits}>Cancel</button>
                <button className="btn-primary text-sm px-3 py-1" onClick={saveEdits}>Save Budgets</button>
              </>
            ) : (
              <button className="btn-secondary text-sm px-3 py-1" onClick={() => setEditing(true)}>Edit Budgets</button>
            )}
          </div>
        </div>
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cost Code</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estimated</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600 uppercase">Budgeted ✎</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-amber-600 uppercase">Actual</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Remaining</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-700 uppercase">Projected</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => {
              const variance = r.estimated - r.projected;
              const over = r.actual > r.budgeted;
              return (
                <tr key={r.category} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-800">{COST_CODE_LABELS[r.category]}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtDec(r.estimated)}</td>
                  <td className="px-4 py-3 text-right">
                    {editing ? (
                      <input
                        type="number" min="0" step="1"
                        className="input w-28 text-sm py-1 text-right"
                        value={budgetDraft[r.category] ?? r.budgeted}
                        onChange={e => setBudgetDraft(d => ({ ...d, [r.category]: Number(e.target.value) }))}
                      />
                    ) : (
                      <span className="font-semibold text-blue-700">{fmtDec(r.budgeted)}</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${over ? 'text-red-600' : 'text-amber-700'}`}>{fmtDec(r.actual)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtDec(r.remaining)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${r.projected > r.estimated ? 'text-red-600' : 'text-gray-800'}`}>{fmtDec(r.projected)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {variance >= 0 ? '+' : ''}{fmtDec(variance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
              <td className="px-4 py-3 text-gray-800">Total</td>
              <td className="px-4 py-3 text-right">{fmtDec(totalEst)}</td>
              <td className="px-4 py-3 text-right text-blue-700">{fmtDec(totalBudgeted)}</td>
              <td className="px-4 py-3 text-right text-amber-700">{fmtDec(totalActual)}</td>
              <td className="px-4 py-3 text-right">{fmtDec(totalRemaining)}</td>
              <td className={`px-4 py-3 text-right ${totalProjected > totalEst ? 'text-red-600' : 'text-gray-800'}`}>{fmtDec(totalProjected)}</td>
              <td className={`px-4 py-3 text-right ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalVariance >= 0 ? '+' : ''}{fmtDec(totalVariance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        <strong>Estimated</strong> = locked from quote · <strong>Budgeted</strong> = your working budget (editable) ·
        <strong> Remaining</strong> = Budgeted − Actual · <strong>Projected</strong> = Actual + Remaining ·
        <strong> Variance</strong> = Estimated − Projected
      </p>
    </div>
  );
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────
function InvoiceDetailModal({ invoice, onClose, onNavigate }: { invoice: Invoice; onClose: () => void; onNavigate: () => void }) {
  const STATUS_COLORS: Record<string, string> = {
    draft: 'text-gray-500', sent: 'text-yellow-600', paid: 'text-green-600', overdue: 'text-red-600', void: 'text-gray-400',
  };
  return (
    <Modal title={`Invoice ${invoice.invoiceNumber}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-xs text-gray-400">Client</p><p className="font-semibold">{invoice.clientName}</p></div>
          <div>
            <p className="text-xs text-gray-400">Status</p>
            <p className={`font-semibold capitalize ${STATUS_COLORS[invoice.status] ?? ''}`}>{invoice.status}</p>
          </div>
          <div><p className="text-xs text-gray-400">Issued</p><p className="font-medium">{fmtDate(invoice.issuedDate)}</p></div>
          <div><p className="text-xs text-gray-400">Due</p><p className="font-medium">{fmtDate(invoice.dueDate)}</p></div>
          {invoice.status === 'paid' && (
            <>
              <div><p className="text-xs text-gray-400">Paid Date</p><p className="font-medium">{fmtDate(invoice.paidDate)}</p></div>
              <div><p className="text-xs text-gray-400">Amount Paid</p><p className="font-semibold text-green-700">{fmtDec(invoice.paidAmount)}</p></div>
            </>
          )}
        </div>

        <div className="rounded-xl overflow-hidden border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Item</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Qty</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Price</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoice.lineItems.map(li => (
                <tr key={li.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{li.name}</p>
                    {li.description && <p className="text-xs text-gray-400">{li.description}</p>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{li.qty}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmtDec(li.unitPrice)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtDec(li.qty * li.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={3} className="px-3 py-2 font-semibold text-gray-700 text-right">Subtotal</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtDec(invoice.subtotal)}</td>
              </tr>
              {invoice.taxAmount > 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-gray-500 text-right text-sm">Tax ({invoice.taxRate}%)</td>
                  <td className="px-3 py-2 text-right text-sm">{fmtDec(invoice.taxAmount)}</td>
                </tr>
              )}
              {invoice.discountAmount > 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-gray-500 text-right text-sm">Discount</td>
                  <td className="px-3 py-2 text-right text-sm text-red-600">−{fmtDec(invoice.discountAmount)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-gray-300">
                <td colSpan={3} className="px-3 py-2 font-bold text-gray-800 text-right">Total</td>
                <td className="px-3 py-2 text-right font-bold text-lg text-[#27AE60]">{fmtDec(invoice.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {invoice.notes && (
          <div><p className="text-xs text-gray-400 mb-1">Notes</p><p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{invoice.notes}</p></div>
        )}

        <div className="flex gap-3 pt-2 border-t">
          <button className="btn-primary flex-1" onClick={onNavigate}>Go to Invoices →</button>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main JobDetail Page ───────────────────────────────────────────────────────
export default function JobDetail({ data, setData }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

  const job = data.jobs.find(j => j.id === id) ?? null;

  if (!job) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Job not found.</p>
        <button className="btn-secondary mt-4" onClick={() => navigate('/jobs')}>← Back to Jobs</button>
      </div>
    );
  }

  const contract    = data.contracts.find(c => c.id === job.contractId) ?? null;
  const crew        = job.crewId ? data.crews.find(c => c.id === job.crewId) : null;
  const crewMembers = crew ? data.employees.filter(e => crew.memberIds.includes(e.id)) : [];
  const invoices    = data.invoices.filter(i => i.contractId === job.contractId && i.status !== 'void');
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.paidAmount, 0);

  const totalBudgeted = job.costCodes.reduce((s, c) => s + c.budgeted, 0);
  const totalActual   = job.costCodes.reduce((s, c) => s + c.actual, 0);
  const totalRemaining = Math.max(0, totalBudgeted - totalActual);

  function updateJob(updated: Job) {
    const newData = { ...data, jobs: data.jobs.map(j => j.id === updated.id ? updated : j) };
    setData(newData); saveData(newData);
  }

  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'overview',   label: 'Overview'   },
    { key: 'schedule',   label: 'Schedule'   },
    { key: 'invoices',   label: `Invoices (${invoices.length})` },
    { key: 'projection', label: 'Projection' },
    { key: 'details',    label: 'Details'    },
  ];

  const STATUS_COLOR: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    on_hold: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back nav */}
      <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors" onClick={() => navigate('/jobs')}>
        ← Back to Jobs
      </button>

      {/* Header card */}
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{job.jobNumber}</h1>
              <h2 className="text-xl text-gray-700">{job.title || job.clientName}</h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLOR[job.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {job.status.replace('_', ' ')}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${job.jobType === 'maintenance' ? 'bg-green-50 text-green-600' : job.jobType === 'landscaping' ? 'bg-blue-50 text-blue-600' : 'bg-sky-50 text-sky-600'}`}>
                {job.jobType}
              </span>
            </div>
            <p className="text-sm text-gray-500">{job.clientName}</p>
            {contract?.address && <p className="text-xs text-gray-400 mt-0.5">{contract.address}</p>}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
              <span>📅 {fmtDate(job.startDate)} → {fmtDate(job.endDate)}</span>
              {crew && <span>👥 {crew.name} ({crewMembers.map(m => m.name).join(', ')})</span>}
              <span>🔁 {job.visitsPerMonth} visits/mo</span>
              {job.driveTimeMinutes > 0 && <span>🚗 {job.driveTimeMinutes} min drive</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select className="input text-sm py-1.5" value={job.status}
              onChange={e => updateJob({ ...job, status: e.target.value as Job['status'] })}>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {contract && (
              <button className="btn-secondary text-sm px-3 py-1.5" onClick={() => navigate(`/quotes/${contract.id}`)}>
                View Quote
              </button>
            )}
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { label: 'Budgeted Cost',   value: fmt(totalBudgeted),  color: 'text-gray-800' },
            { label: 'Actual Cost',     value: fmt(totalActual),    color: totalActual > totalBudgeted ? 'text-red-600' : 'text-amber-700' },
            { label: 'Remaining',       value: fmt(totalRemaining), color: 'text-blue-600' },
            { label: 'Invoiced / Paid', value: `${fmt(totalInvoiced)} / ${fmt(totalPaid)}`, color: 'text-[#27AE60]' },
          ].map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">{m.label}</p>
              <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-gray-200 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-[#27AE60] text-[#27AE60]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Cost code summary */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cost Code Summary</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Cost Code','Budgeted','Actual','Remaining','% Used'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {job.costCodes.map(cc => {
                  const remaining = Math.max(0, cc.budgeted - cc.actual);
                  const pctUsed   = cc.budgeted > 0 ? (cc.actual / cc.budgeted) * 100 : 0;
                  const over      = cc.actual > cc.budgeted;
                  return (
                    <tr key={cc.category} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{COST_CODE_LABELS[cc.category]}</td>
                      <td className="px-4 py-3 text-gray-700">{fmtDec(cc.budgeted)}</td>
                      <td className={`px-4 py-3 font-semibold ${over ? 'text-red-600' : 'text-amber-700'}`}>{fmtDec(cc.actual)}</td>
                      <td className="px-4 py-3 text-blue-600">{fmtDec(remaining)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${over ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(pctUsed, 100)}%` }} />
                          </div>
                          <span className={`text-xs ${over ? 'text-red-600' : 'text-gray-500'}`}>{Math.round(pctUsed)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Quote snapshot */}
          {contract && (
            <div className="card">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Source Quote</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Quote #</p><p className="font-semibold">{contract.estimateNumber}</p></div>
                <div><p className="text-xs text-gray-400">Monthly Revenue</p><p className="font-semibold text-[#27AE60]">{formatCurrency(contract.monthlyRevenue)}/mo</p></div>
                <div><p className="text-xs text-gray-400">Annual Value</p><p className="font-semibold">{formatCurrency(contract.annualRevenue)}</p></div>
                <div>
                  <p className="text-xs text-gray-400">Gross Margin</p>
                  <p className={`font-semibold ${contract.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                    {formatPercent(contract.grossMargin)}
                  </p>
                </div>
                <div><p className="text-xs text-gray-400">Property Type</p><p className="capitalize">{contract.propertyType}</p></div>
                <div><p className="text-xs text-gray-400">Active Months</p><p>{contract.activeMonths?.length ?? '—'} months</p></div>
                <div><p className="text-xs text-gray-400">Visits/Month</p><p>{contract.visitsPerMonth}</p></div>
                <div><p className="text-xs text-gray-400">Contract Length</p><p>{contract.contractLength?.replace('_', ' ') ?? 'Custom'}</p></div>
              </div>
              {contract.lineItems.filter(i => !i.optional).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Line Items</p>
                  <div className="flex flex-wrap gap-1">
                    {contract.lineItems.filter(i => !i.optional).map(li => (
                      <span key={li.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                        {li.name} {li.qty > 1 ? `×${li.qty}` : ''} · {formatCurrency(li.unitPrice)}/{li.unit}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'schedule' && (
        <ScheduleTab
          job={job}
          data={data}
          updateJob={updateJob}
          onNavigateSchedule={() => navigate('/schedule')}
        />
      )}

      {activeTab === 'invoices' && (
        <InvoicesTab
          job={job}
          data={data}
          onViewInvoice={inv => setViewInvoice(inv)}
        />
      )}

      {activeTab === 'projection' && (
        <ProjectionTab job={job} data={data} setData={setData} />
      )}

      {activeTab === 'details' && (
        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Job Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={job.startDate}
                onChange={e => updateJob({ ...job, startDate: e.target.value })} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={job.endDate}
                onChange={e => updateJob({ ...job, endDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Crew</label>
              <select className="input" value={job.crewId ?? ''}
                onChange={e => updateJob({ ...job, crewId: e.target.value || undefined })}>
                <option value="">Unassigned</option>
                {data.crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Visits / Month</label>
              <input type="number" min="1" className="input" value={job.visitsPerMonth}
                onChange={e => updateJob({ ...job, visitsPerMonth: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Hours Per Visit</label>
              <input type="number" min="0" step="0.25" className="input" value={job.hoursPerVisit}
                onChange={e => updateJob({ ...job, hoursPerVisit: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Drive Time (minutes)</label>
              <input type="number" min="0" className="input" value={job.driveTimeMinutes}
                onChange={e => updateJob({ ...job, driveTimeMinutes: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input" rows={3} value={job.notes}
                onChange={e => updateJob({ ...job, notes: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {/* Invoice detail modal */}
      {viewInvoice && (
        <InvoiceDetailModal
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          onNavigate={() => { setViewInvoice(null); navigate('/invoices'); }}
        />
      )}
    </div>
  );
}
