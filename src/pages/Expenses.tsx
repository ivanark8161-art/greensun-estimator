import { useState } from 'react';
import type { AppData, ExpenseEntry, ExpenseCategory } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';
import { pushExpenseToQBO } from '../utils/qboApi';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

const CAT_LABELS: Record<ExpenseCategory, string> = {
  fuel: 'Fuel', material: 'Material', equipment: 'Equipment',
  subcontractor: 'Subcontractor', other: 'Other',
};
const CAT_COLORS: Record<ExpenseCategory, string> = {
  fuel: 'bg-orange-100 text-orange-700', material: 'bg-blue-100 text-blue-700',
  equipment: 'bg-yellow-100 text-yellow-700', subcontractor: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-700',
};

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Log Expense Tab ──────────────────────────────────────────────────────────
function LogExpenseTab({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry | null>(null);
  const [filterCat, setFilterCat] = useState<ExpenseCategory | 'all'>('all');
  const [filterJob, setFilterJob] = useState('all');
  const [uploading, setUploading] = useState(false);

  const blankForm = (): Omit<ExpenseEntry, 'id' | 'createdAt'> => ({
    date: new Date().toISOString().split('T')[0],
    employeeId: data.employees[0]?.id ?? '',
    employeeName: data.employees[0]?.name ?? '',
    jobType: 'contract',
    jobId: data.jobs[0]?.id ?? '',
    jobName: data.jobs[0] ? `${data.jobs[0].jobNumber} · ${data.jobs[0].clientName}` : 'General',
    costCodeId: '',
    category: 'material',
    description: '',
    amount: 0,
    notes: '',
    receiptDataUrl: undefined,
    receiptName: undefined,
    status: 'pending',
  });

  const [form, setForm] = useState(blankForm);

  const jobOptions = [
    ...data.jobs.filter(j => j.status !== 'archived').map(j => ({ id: j.id, name: `${j.jobNumber} · ${j.clientName}`, type: 'contract' as const })),
    ...data.contracts.filter(c => !data.jobs.find(j => j.contractId === c.id))
      .map(c => ({ id: c.id, name: c.clientName, type: 'contract' as const })),
    { id: '', name: 'Overhead / General', type: 'overhead' as const },
  ];

  const expenseCodes = data.accountingCodes.filter(a => !a.code.startsWith('01-'));

  function open(e?: ExpenseEntry) {
    if (e) { setEditing(e); setForm({ ...e }); }
    else   { setEditing(null); setForm(blankForm()); }
    setShowModal(true);
  }

  function handleEmpChange(empId: string) {
    const emp = data.employees.find(e => e.id === empId);
    setForm(f => ({ ...f, employeeId: empId, employeeName: emp?.name ?? '' }));
  }

  function handleJobChange(jobId: string) {
    const job = jobOptions.find(j => j.id === jobId);
    setForm(f => ({ ...f, jobId: job?.id || undefined, jobName: job?.name ?? 'Overhead / General', jobType: job?.type ?? 'overhead' }));
  }

  function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = ev => {
      setForm(f => ({ ...f, receiptDataUrl: ev.target?.result as string, receiptName: file.name }));
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function save() {
    if (!form.description.trim()) { alert('Description required'); return; }
    if (!form.amount || form.amount <= 0) { alert('Enter amount greater than 0'); return; }
    let updated: AppData;
    if (editing) {
      updated = { ...data, expenses: data.expenses.map(e => e.id === editing.id ? { ...editing, ...form } : e) };
    } else {
      updated = { ...data, expenses: [...data.expenses, { id: `exp_${Date.now()}`, ...form, createdAt: new Date().toISOString(), status: 'pending' as const }] };
    }
    setData(updated); saveData(updated); setShowModal(false);
  }

  function del(id: string) {
    if (!confirm('Delete this expense?')) return;
    const updated = { ...data, expenses: data.expenses.filter(e => e.id !== id) };
    setData(updated); saveData(updated);
  }

  // Show all approved expenses + pending ones logged by user (not yet reviewed)
  const approved = data.expenses.filter(e => e.status === 'approved');
  const pending  = data.expenses.filter(e => e.status === 'pending');

  const filtered = [...approved].filter(e => {
    if (filterCat !== 'all' && e.category !== filterCat) return false;
    if (filterJob !== 'all' && e.jobId !== filterJob) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const thisMonth = approved.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const totalThisMonth = thisMonth.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Approved This Month</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalThisMonth)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Pending Approval</p>
          <p className="text-2xl font-bold text-yellow-600">{pending.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Approved</p>
          <p className="text-2xl font-bold text-gray-800">{approved.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">All Time</p>
          <p className="text-2xl font-bold text-gray-600">{formatCurrency(approved.reduce((s, e) => s + e.amount, 0))}</p>
        </div>
      </div>

      {/* Pending banner */}
      {pending.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
          <strong>{pending.length} expense{pending.length > 1 ? 's' : ''}</strong> pending approval — go to the Approvals tab to review.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <select className="input max-w-xs" value={filterCat} onChange={e => setFilterCat(e.target.value as ExpenseCategory | 'all')}>
          <option value="all">All Categories</option>
          {(Object.entries(CAT_LABELS) as [ExpenseCategory, string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-xs" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {data.jobs.filter(j => j.status !== 'archived').map(j => <option key={j.id} value={j.id}>{j.jobNumber} · {j.clientName}</option>)}
        </select>
        <button className="btn-primary ml-auto" onClick={() => open()}>+ Log Expense</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Date','Employee','Job','Category','Description','Amount','Receipt',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                No approved expenses yet. <button className="text-[#27AE60] hover:underline" onClick={() => open()}>Log one →</button>
              </td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.date}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{e.employeeName || '—'}</td>
                <td className="px-4 py-3 text-gray-700 text-xs">{e.jobName}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[e.category]}`}>
                    {CAT_LABELS[e.category]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-800">{e.description}</td>
                <td className="px-4 py-3 font-semibold text-amber-600">{formatCurrency(e.amount)}</td>
                <td className="px-4 py-3">
                  {e.receiptDataUrl ? (
                    <a href={e.receiptDataUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                      📎 {e.receiptName ?? 'Receipt'}
                    </a>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(e)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => del(e.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold text-sm">
                <td colSpan={5} className="px-4 py-2 text-gray-600">Total</td>
                <td className="px-4 py-2 text-amber-600">{formatCurrency(filtered.reduce((s,e) => s+e.amount,0))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Expense' : 'Log Expense'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
              </div>
              <div>
                <label className="label">Amount ($)</label>
                <input className="input" type="number" step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({...f, amount: Number(e.target.value)}))} />
              </div>
              <div>
                <label className="label">Employee</label>
                <select className="input" value={form.employeeId ?? ''} onChange={e => handleEmpChange(e.target.value)}>
                  <option value="">None</option>
                  {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Job</label>
                <select className="input" value={form.jobId ?? ''} onChange={e => handleJobChange(e.target.value)}>
                  {jobOptions.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value as ExpenseCategory}))}>
                  {(Object.entries(CAT_LABELS) as [ExpenseCategory, string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Cost Code</label>
                <select className="input" value={form.costCodeId ?? ''} onChange={e => setForm(f => ({...f, costCodeId: e.target.value}))}>
                  <option value="">No code</option>
                  {expenseCodes.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Description *</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What was this expense for?" />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Vendor, receipt #, etc." />
              </div>
              <div className="col-span-2">
                <label className="label">Receipt / Attachment</label>
                <div className="flex items-center gap-3">
                  <label className="btn-secondary text-xs px-3 py-1.5 cursor-pointer">
                    {uploading ? 'Uploading…' : '📎 Attach Receipt'}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleReceiptUpload} />
                  </label>
                  {form.receiptName && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      {form.receiptName}
                      <button onClick={() => setForm(f => ({...f, receiptDataUrl: undefined, receiptName: undefined}))} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
              This expense will be sent to <strong>Approvals</strong> before appearing in the approved list.
            </div>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={save}>Submit for Approval →</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Approvals Tab ────────────────────────────────────────────────────────────
function ExpenseApprovalsTab({ data, setData }: Props) {
  const [viewExp, setViewExp] = useState<ExpenseEntry | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  async function pushToQBO(exp: ExpenseEntry) {
    setPushingId(exp.id);
    setPushError(null);
    try {
      await pushExpenseToQBO(exp);
      const updated: ExpenseEntry = { ...exp, qboSyncedAt: new Date().toISOString() };
      const newData = { ...data, expenses: data.expenses.map(e => e.id === exp.id ? updated : e) };
      setData(newData); saveData(newData);
      if (viewExp?.id === exp.id) setViewExp(updated);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Push failed');
    } finally {
      setPushingId(null);
    }
  }

  const pending  = data.expenses.filter(e => e.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviewed = data.expenses.filter(e => e.status !== 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function approve(exp: ExpenseEntry) {
    const updated: ExpenseEntry = {
      ...exp, status: 'approved', approvedBy: 'Admin', approvedAt: new Date().toISOString(),
    };
    const newData = { ...data, expenses: data.expenses.map(e => e.id === exp.id ? updated : e) };
    setData(newData); saveData(newData); setViewExp(null);
  }

  function reject(exp: ExpenseEntry, notes: string) {
    const updated: ExpenseEntry = {
      ...exp, status: 'rejected', approvedBy: 'Admin', approvedAt: new Date().toISOString(), rejectionNotes: notes,
    };
    const newData = { ...data, expenses: data.expenses.map(e => e.id === exp.id ? updated : e) };
    setData(newData); saveData(newData);
    setRejectTarget(null); setRejectNotes(''); setViewExp(null);
  }

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
          <div className="card text-center py-8 text-gray-400 text-sm">No expenses awaiting approval.</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date','Employee','Job','Category','Description','Amount','Receipt',''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map(exp => (
                  <tr key={exp.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewExp(exp)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{exp.date}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{exp.employeeName || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{exp.jobName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[exp.category]}`}>
                        {CAT_LABELS[exp.category]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-800">{exp.description}</td>
                    <td className="px-4 py-2.5 font-semibold text-amber-600">{formatCurrency(exp.amount)}</td>
                    <td className="px-4 py-2.5">
                      {exp.receiptDataUrl
                        ? <a href={exp.receiptDataUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline" onClick={e => e.stopPropagation()}>📎</a>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <button className="text-xs text-green-600 font-semibold hover:underline" onClick={() => approve(exp)}>✓</button>
                        <button className="text-xs text-red-500 font-semibold hover:underline" onClick={() => { setRejectTarget(exp.id); setViewExp(exp); }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t font-semibold text-sm">
                  <td colSpan={5} className="px-4 py-2 text-gray-600">Total Pending</td>
                  <td className="px-4 py-2 text-amber-600">{formatCurrency(pending.reduce((s,e) => s+e.amount,0))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* History */}
      {reviewed.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Review History</h3>
          {pushError && (
            <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              QBO push failed: {pushError}
            </div>
          )}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date','Employee','Description','Amount','Status','QBO','Reviewed'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviewed.slice(0, 30).map(exp => (
                  <tr key={exp.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewExp(exp)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{exp.date}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{exp.employeeName || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700">{exp.description}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{formatCurrency(exp.amount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[exp.status] ?? ''}`}>
                        {exp.status}
                      </span>
                      {exp.rejectionNotes && <span className="text-xs text-red-500 ml-2 italic">{exp.rejectionNotes}</span>}
                    </td>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      {exp.status === 'approved' && (
                        exp.qboSyncedAt
                          ? <span className="text-xs text-green-600 font-semibold">✓ Synced</span>
                          : <button
                              className="text-xs px-2 py-0.5 rounded border border-[#27AE60] text-[#27AE60] hover:bg-green-50 disabled:opacity-40"
                              disabled={pushingId === exp.id}
                              onClick={() => pushToQBO(exp)}
                            >
                              {pushingId === exp.id ? '…' : '↑ QBO'}
                            </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
                      {exp.approvedAt ? fmtDate(exp.approvedAt.split('T')[0]) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail / Approve modal */}
      {viewExp && (
        <Modal title="Review Expense" onClose={() => { setViewExp(null); setRejectTarget(null); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">Date</p><p className="font-semibold">{viewExp.date}</p></div>
              <div><p className="text-xs text-gray-400">Employee</p><p className="font-semibold">{viewExp.employeeName || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Job</p><p className="font-semibold">{viewExp.jobName}</p></div>
              <div><p className="text-xs text-gray-400">Category</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[viewExp.category]}`}>{CAT_LABELS[viewExp.category]}</span>
              </div>
              <div className="col-span-2"><p className="text-xs text-gray-400">Description</p><p className="font-semibold">{viewExp.description}</p></div>
              {viewExp.notes && <div className="col-span-2"><p className="text-xs text-gray-400">Notes</p><p className="text-gray-700">{viewExp.notes}</p></div>}
              <div><p className="text-xs text-gray-400">Amount</p><p className="font-bold text-amber-600 text-lg">{formatCurrency(viewExp.amount)}</p></div>
              {viewExp.receiptDataUrl && (
                <div><p className="text-xs text-gray-400">Receipt</p>
                  <a href={viewExp.receiptDataUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">📎 {viewExp.receiptName ?? 'View Receipt'}</a>
                </div>
              )}
            </div>

            {rejectTarget === viewExp.id && (
              <div className="space-y-2">
                <label className="label text-red-600">Rejection Notes</label>
                <textarea className="input" rows={2} value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} placeholder="Reason for rejection..." />
              </div>
            )}

            {viewExp.status === 'pending' ? (
              <div className="flex gap-3 pt-2 border-t">
                {rejectTarget === viewExp.id ? (
                  <>
                    <button className="btn-primary flex-1 bg-red-600 border-red-600" onClick={() => reject(viewExp, rejectNotes)}>Confirm Reject</button>
                    <button className="btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn-primary flex-1" onClick={() => approve(viewExp)}>✓ Approve</button>
                    <button className="text-sm px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50" onClick={() => setRejectTarget(viewExp.id)}>✕ Reject</button>
                    <button className="btn-secondary" onClick={() => setViewExp(null)}>Close</button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex gap-3 pt-2 border-t flex-wrap items-center">
                <span className={`text-sm px-3 py-2 rounded-xl font-semibold ${viewExp.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {viewExp.status === 'approved' ? '✓ Approved' : '✕ Rejected'}
                </span>
                {viewExp.status === 'approved' && (
                  viewExp.qboSyncedAt
                    ? <span className="text-xs text-green-600 font-semibold">✓ Synced to QBO {new Date(viewExp.qboSyncedAt).toLocaleDateString()}</span>
                    : <button
                        className="btn-secondary text-sm"
                        disabled={pushingId === viewExp.id}
                        onClick={() => pushToQBO(viewExp)}
                      >
                        {pushingId === viewExp.id ? 'Pushing…' : '↑ Push to QBO'}
                      </button>
                )}
                <button className="btn-secondary ml-auto" onClick={() => setViewExp(null)}>Close</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type Tab = 'expenses' | 'approvals';

export default function Expenses({ data, setData }: Props) {
  const [tab, setTab] = useState<Tab>('expenses');

  const pendingCount = data.expenses.filter(e => e.status === 'pending').length;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'expenses',  label: 'Expenses' },
    { key: 'approvals', label: `Approvals${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Expenses"
        subtitle="Track actual job expenses — fuel, materials, equipment, subcontractors"
      />

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

      {tab === 'expenses'  && <LogExpenseTab      data={data} setData={setData} />}
      {tab === 'approvals' && <ExpenseApprovalsTab data={data} setData={setData} />}
    </div>
  );
}
