import { useState } from 'react';
import type { AppData, Job, JobCostCode, JobProjectionSnapshot, CostCodeCategory } from '../types';
import { COST_CODE_LABELS } from '../types';
import { saveData } from '../utils/storage';

interface Props { data: AppData; setData: (d: AppData) => void; }

const COST_CODE_CATEGORIES: CostCodeCategory[] = ['labor', 'materials', 'subcontractor', 'equipment', 'other'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtDec(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// Maintenance season: Apr–Oct; Snow: Nov–Mar
function seasonMonthsRemaining(job: Job): number {
  const today = new Date();
  const end = new Date(job.endDate);
  if (end <= today) return 0;
  const start = today > new Date(job.startDate) ? today : new Date(job.startDate);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}

function pctElapsed(job: Job): number {
  const start = new Date(job.startDate).getTime();
  const end   = new Date(job.endDate).getTime();
  const now   = Date.now();
  if (now >= end) return 1;
  if (now <= start) return 0;
  return (now - start) / (end - start);
}

function buildProjection(job: Job, invoicedToDate: number, notes: string): JobProjectionSnapshot {
  const pct = pctElapsed(job);
  const label = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const codes = job.costCodes.map(cc => {
    const projectedCost = cc.budgeted * pct;
    const remainingCost = Math.max(0, cc.budgeted - cc.actual);
    const rev = job.costCodes.reduce((s, c) => s + c.budgeted, 0);
    const marginPct = rev > 0 ? ((rev - (cc.actual + remainingCost)) / rev) * 100 : 0;
    return {
      category: cc.category,
      originalEstimate: cc.budgeted,
      actualCost: cc.actual,
      remainingCost,
      projectedCost,
      marginPct,
    };
  });
  const totalOriginal  = codes.reduce((s, c) => s + c.originalEstimate, 0);
  const totalActual    = codes.reduce((s, c) => s + c.actualCost, 0);
  const totalRemaining = codes.reduce((s, c) => s + c.remainingCost, 0);
  const totalProjected = codes.reduce((s, c) => s + c.projectedCost, 0);
  const projectedMargin = totalOriginal > 0 ? ((totalOriginal - totalProjected) / totalOriginal) * 100 : 0;
  return {
    id: `proj_${Date.now()}`,
    postedAt: new Date().toISOString(),
    periodLabel: label,
    costCodes: codes,
    totalOriginal,
    totalActual,
    totalRemaining,
    totalProjected,
    projectedMargin,
    invoicedToDate,
    notes,
  };
}

export default function Jobs({ data, setData }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    data.jobs.length > 0 ? data.jobs[0].id : null
  );
  const [tab, setTab] = useState<'costcodes' | 'projections' | 'details'>('costcodes');
  const [editingCodes, setEditingCodes] = useState(false);
  const [codesDraft, setCodesDraft] = useState<JobCostCode[]>([]);
  const [showProjectionModal, setShowProjectionModal] = useState(false);
  const [projNotes, setProjNotes] = useState('');

  const job = data.jobs.find(j => j.id === selectedId) ?? null;

  function save(updated: Job) {
    const newData = { ...data, jobs: data.jobs.map(j => j.id === updated.id ? updated : j) };
    setData(newData); saveData(newData);
  }

  function startEditCodes() {
    if (!job) return;
    setCodesDraft(job.costCodes.map(c => ({ ...c })));
    setEditingCodes(true);
  }

  function saveCodes() {
    if (!job) return;
    save({ ...job, costCodes: codesDraft });
    setEditingCodes(false);
  }

  function patchCode(category: CostCodeCategory, field: keyof JobCostCode, value: number | string) {
    setCodesDraft(d => d.map(c => c.category === category ? { ...c, [field]: value } : c));
  }

  function postProjection() {
    if (!job) return;
    const invoicedToDate = data.invoices
      .filter(i => i.contractId === job.contractId && i.status !== 'void')
      .reduce((s, i) => s + i.total, 0);
    const snap = buildProjection(job, invoicedToDate, projNotes);
    save({ ...job, projections: [...job.projections, snap], lastProjectionPrompt: new Date().toISOString() });
    setShowProjectionModal(false);
    setProjNotes('');
  }

  function updateField(field: keyof Job, value: unknown) {
    if (!job) return;
    save({ ...job, [field]: value });
  }

  const contract = job ? data.contracts.find(c => c.id === job.contractId) : null;
  const crew     = job?.crewId ? data.crews.find(c => c.id === job.crewId) : null;
  const crewMembers = crew ? data.employees.filter(e => crew.memberIds.includes(e.id)) : [];

  const totalBudgeted = job?.costCodes.reduce((s, c) => s + c.budgeted, 0) ?? 0;
  const totalActual   = job?.costCodes.reduce((s, c) => s + c.actual, 0) ?? 0;
  const invoicedTotal = job
    ? data.invoices.filter(i => i.contractId === job.contractId && i.status !== 'void').reduce((s, i) => s + i.total, 0)
    : 0;

  return (
    <div className="flex h-full gap-4" style={{ minHeight: 600 }}>
      {/* ── Left: job list ── */}
      <div className="w-60 shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-gray-700">Active Jobs</h2>
        </div>
        {data.jobs.length === 0 && (
          <p className="text-xs text-gray-400 italic">No jobs yet. Convert a quote to a job from the Quotes page.</p>
        )}
        {data.jobs.map(j => {
          const c = data.contracts.find(ct => ct.id === j.contractId);
          return (
            <button
              key={j.id}
              onClick={() => { setSelectedId(j.id); setTab('costcodes'); setEditingCodes(false); }}
              className={`text-left p-3 rounded-xl border transition-colors ${
                selectedId === j.id
                  ? 'bg-[#27AE60] text-white border-[#27AE60]'
                  : 'bg-white border-gray-200 hover:border-green-300'
              }`}
            >
              <p className="font-semibold text-sm">{j.jobNumber}</p>
              <p className={`text-xs mt-0.5 ${selectedId === j.id ? 'text-green-100' : 'text-gray-500'}`}>{j.clientName}</p>
              <p className={`text-xs ${selectedId === j.id ? 'text-green-100' : 'text-gray-400'}`}>{j.title}</p>
              {c && (
                <span className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  j.status === 'active' ? 'bg-green-100 text-green-700' :
                  j.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                  j.status === 'on_hold' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {j.status.replace('_', ' ')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Right: job detail ── */}
      {!job && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a job or convert a quote to get started.
        </div>
      )}

      {job && (
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Header */}
          <div className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-gray-900">{job.jobNumber} — {job.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    job.status === 'active' ? 'bg-green-100 text-green-700' :
                    job.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                    job.status === 'on_hold' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{job.status.replace('_', ' ')}</span>
                </div>
                <p className="text-sm text-gray-500">{job.clientName} · {job.jobType}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {job.startDate} → {job.endDate} · Crew: {crew?.name ?? 'Unassigned'} · {job.visitsPerMonth} visits/mo · {job.driveTimeMinutes} min drive
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <select
                  className="input text-sm py-1"
                  value={job.status}
                  onChange={e => updateField('status', e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  className="btn-primary text-sm px-3 py-1"
                  onClick={() => setShowProjectionModal(true)}
                >
                  + Post Projection
                </button>
              </div>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Total Budgeted', value: fmt(totalBudgeted), color: 'text-gray-800' },
                { label: 'Actual Cost', value: fmt(totalActual), color: totalActual > totalBudgeted ? 'text-red-600' : 'text-gray-800' },
                { label: 'Remaining', value: fmt(Math.max(0, totalBudgeted - totalActual)), color: 'text-blue-600' },
                { label: 'Invoiced to Date', value: fmt(invoicedTotal), color: 'text-green-700' },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                  <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {(['costcodes', 'projections', 'details'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                  tab === t ? 'border-[#27AE60] text-[#27AE60]' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'costcodes' ? 'Cost Codes' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Cost Codes Tab ── */}
          {tab === 'costcodes' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cost Code Breakdown</h3>
                {!editingCodes
                  ? <button className="btn-secondary text-sm px-3 py-1" onClick={startEditCodes}>Edit Budgets</button>
                  : <div className="flex gap-2">
                      <button className="btn-secondary text-sm px-3 py-1" onClick={() => setEditingCodes(false)}>Cancel</button>
                      <button className="btn-primary text-sm px-3 py-1" onClick={saveCodes}>Save</button>
                    </div>
                }
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['Cost Code', 'Budgeted', 'Actual Cost', 'Remaining', '% Used', 'Notes'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase py-2 px-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(editingCodes ? codesDraft : job.costCodes).map(cc => {
                    const remaining = Math.max(0, cc.budgeted - cc.actual);
                    const pctUsed   = cc.budgeted > 0 ? (cc.actual / cc.budgeted) * 100 : 0;
                    const over      = cc.actual > cc.budgeted;
                    return (
                      <tr key={cc.category} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2 font-semibold text-gray-800">{COST_CODE_LABELS[cc.category]}</td>
                        <td className="py-3 px-2">
                          {editingCodes
                            ? <input type="number" min="0" step="1"
                                className="input w-28 text-sm py-1"
                                value={codesDraft.find(c => c.category === cc.category)?.budgeted ?? 0}
                                onChange={e => patchCode(cc.category, 'budgeted', Number(e.target.value))} />
                            : <span className="text-gray-700">{fmtDec(cc.budgeted)}</span>
                          }
                        </td>
                        <td className="py-3 px-2">
                          {editingCodes
                            ? <input type="number" min="0" step="1"
                                className="input w-28 text-sm py-1"
                                value={codesDraft.find(c => c.category === cc.category)?.actual ?? 0}
                                onChange={e => patchCode(cc.category, 'actual', Number(e.target.value))} />
                            : <span className={over ? 'text-red-600 font-semibold' : 'text-gray-700'}>{fmtDec(cc.actual)}</span>
                          }
                        </td>
                        <td className="py-3 px-2">
                          <span className={remaining === 0 ? 'text-red-600' : 'text-blue-600'}>{fmtDec(remaining)}</span>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${over ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(pctUsed, 100)}%` }} />
                            </div>
                            <span className={`text-xs ${over ? 'text-red-600' : 'text-gray-500'}`}>{Math.round(pctUsed)}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          {editingCodes
                            ? <input className="input text-sm py-1 w-full"
                                value={codesDraft.find(c => c.category === cc.category)?.notes ?? ''}
                                onChange={e => patchCode(cc.category, 'notes', e.target.value)} />
                            : <span className="text-gray-400 text-xs">{cc.notes || '—'}</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="py-3 px-2 font-bold text-gray-800">Total</td>
                    <td className="py-3 px-2 font-bold">{fmtDec(totalBudgeted)}</td>
                    <td className="py-3 px-2 font-bold">{fmtDec(totalActual)}</td>
                    <td className="py-3 px-2 font-bold text-blue-600">{fmtDec(Math.max(0, totalBudgeted - totalActual))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              {contract && (
                <p className="text-xs text-gray-400 mt-3">Source quote: {contract.estimateNumber} · {contract.clientName}</p>
              )}
            </div>
          )}

          {/* ── Projections Tab ── */}
          {tab === 'projections' && (
            <div className="flex flex-col gap-4">
              {job.projections.length === 0 && (
                <div className="card text-center py-10 text-gray-400">
                  <p className="text-sm">No projections posted yet.</p>
                  <p className="text-xs mt-1">Click "Post Projection" to record your first monthly projection.</p>
                </div>
              )}
              {[...job.projections].reverse().map(snap => (
                <div key={snap.id} className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-gray-800">{snap.periodLabel} Projection</h4>
                      <p className="text-xs text-gray-400">Posted {new Date(snap.postedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-4 text-right text-sm">
                      <div>
                        <p className="text-xs text-gray-400">Invoiced</p>
                        <p className="font-semibold text-green-700">{fmt(snap.invoicedToDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Proj. Margin</p>
                        <p className={`font-semibold ${snap.projectedMargin >= 20 ? 'text-green-700' : 'text-red-600'}`}>
                          {snap.projectedMargin.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {['Cost Code', 'Original Est.', 'Actual Cost', 'Remaining', 'Projected Cost', 'Margin %'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase py-1.5 px-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snap.costCodes.map(cc => (
                        <tr key={cc.category} className="border-b border-gray-100">
                          <td className="py-2 px-2 font-medium text-gray-700">{COST_CODE_LABELS[cc.category]}</td>
                          <td className="py-2 px-2 text-gray-600">{fmtDec(cc.originalEstimate)}</td>
                          <td className="py-2 px-2 text-gray-600">{fmtDec(cc.actualCost)}</td>
                          <td className="py-2 px-2 text-blue-600">{fmtDec(cc.remainingCost)}</td>
                          <td className="py-2 px-2 text-gray-700">{fmtDec(cc.projectedCost)}</td>
                          <td className="py-2 px-2">
                            <span className={cc.marginPct >= 20 ? 'text-green-600' : 'text-red-500'}>
                              {cc.marginPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                        <td className="py-2 px-2">Total</td>
                        <td className="py-2 px-2">{fmtDec(snap.totalOriginal)}</td>
                        <td className="py-2 px-2">{fmtDec(snap.totalActual)}</td>
                        <td className="py-2 px-2 text-blue-600">{fmtDec(snap.totalRemaining)}</td>
                        <td className="py-2 px-2">{fmtDec(snap.totalProjected)}</td>
                        <td className={`py-2 px-2 ${snap.projectedMargin >= 20 ? 'text-green-600' : 'text-red-500'}`}>
                          {snap.projectedMargin.toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {snap.notes && <p className="text-xs text-gray-400 mt-2 italic">{snap.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {/* ── Details Tab ── */}
          {tab === 'details' && (
            <div className="card">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Job Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" className="input" value={job.startDate}
                    onChange={e => updateField('startDate', e.target.value)} />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" className="input" value={job.endDate}
                    onChange={e => updateField('endDate', e.target.value)} />
                </div>
                <div>
                  <label className="label">Crew</label>
                  <select className="input" value={job.crewId ?? ''}
                    onChange={e => updateField('crewId', e.target.value || undefined)}>
                    <option value="">Unassigned</option>
                    {data.crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Visits / Month</label>
                  <input type="number" min="1" className="input" value={job.visitsPerMonth}
                    onChange={e => updateField('visitsPerMonth', Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Hours Per Visit</label>
                  <input type="number" min="0" step="0.25" className="input" value={job.hoursPerVisit}
                    onChange={e => updateField('hoursPerVisit', Number(e.target.value))} />
                  {crew && crewMembers.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {crewMembers.length} crew member{crewMembers.length > 1 ? 's' : ''}: {crewMembers.map(e => e.name).join(', ')}
                      {' · '}Est. {(job.hoursPerVisit * crewMembers.length).toFixed(1)} total hrs/visit
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Drive Time (minutes)</label>
                  <input type="number" min="0" className="input" value={job.driveTimeMinutes}
                    onChange={e => updateField('driveTimeMinutes', Number(e.target.value))} />
                  <p className="text-xs text-gray-400 mt-1">Edit if driving from another job (not from shop)</p>
                </div>
                <div className="col-span-2">
                  <label className="label">Notes</label>
                  <textarea className="input" rows={3} value={job.notes}
                    onChange={e => updateField('notes', e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Post Projection Modal ── */}
      {showProjectionModal && job && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Post Monthly Projection</h3>
            <p className="text-sm text-gray-500 mb-4">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · {(pctElapsed(job) * 100).toFixed(0)}% through job timeline
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Original Estimate</span>
                <span className="font-semibold">{fmt(totalBudgeted)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Actual Cost to Date</span>
                <span className="font-semibold">{fmt(totalActual)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Projected Cost at Completion</span>
                <span className="font-semibold">{fmt(totalBudgeted * pctElapsed(job))}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-gray-500">Invoiced to Date</span>
                <span className="font-semibold text-green-700">{fmt(invoicedTotal)}</span>
              </div>
            </div>
            <div className="mb-4">
              <label className="label">Notes (optional)</label>
              <textarea className="input" rows={2} value={projNotes}
                onChange={e => setProjNotes(e.target.value)}
                placeholder="Any notes about this projection period..." />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm px-4 py-2" onClick={() => setShowProjectionModal(false)}>Cancel</button>
              <button className="btn-primary text-sm px-4 py-2" onClick={postProjection}>Post Projection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
