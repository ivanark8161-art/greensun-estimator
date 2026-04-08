import { useState } from 'react';
import type { AppData, ExpenseEntry, ExpenseCategory } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';
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

function blankEntry(data: AppData): Omit<ExpenseEntry, 'id' | 'createdAt'> {
  return {
    date: new Date().toISOString().split('T')[0],
    jobType: 'contract',
    jobId: data.contracts[0]?.id,
    jobName: data.contracts[0]?.clientName ?? 'General',
    category: 'material',
    description: '',
    amount: 0,
    notes: '',
  };
}

export default function Expenses({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<ExpenseEntry | null>(null);
  const [form, setForm]           = useState(() => blankEntry(data));
  const [filterCat, setFilterCat] = useState<ExpenseCategory | 'all'>('all');
  const [filterJob, setFilterJob] = useState('all');

  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const jobOptions = [
    ...data.contracts.map(c => ({ id: c.id, name: c.clientName, type: 'contract' as const })),
    ...data.projects.map(p => ({ id: p.id, name: `${p.projectNumber} · ${p.clientName}`, type: 'project' as const })),
    { id: '', name: 'Overhead / General', type: 'overhead' as const },
  ];

  function open(e?: ExpenseEntry) {
    if (e) { setEditing(e); setForm({ ...e }); }
    else   { setEditing(null); setForm(blankEntry(data)); }
    setShowModal(true);
  }

  function save() {
    if (!form.description.trim()) { alert('Description required'); return; }
    if (!form.amount || form.amount <= 0) { alert('Enter amount greater than 0'); return; }
    const now2 = new Date().toISOString();
    let updated: AppData;
    if (editing) {
      updated = { ...data, expenses: data.expenses.map(e => e.id === editing.id ? { ...editing, ...form } : e) };
    } else {
      updated = { ...data, expenses: [...data.expenses, { id: `exp_${Date.now()}`, ...form, createdAt: now2 }] };
    }
    setData(updated); saveData(updated); setShowModal(false);
  }

  function del(id: string) {
    if (!confirm('Delete this expense?')) return;
    const updated = { ...data, expenses: data.expenses.filter(e => e.id !== id) };
    setData(updated); saveData(updated);
  }

  function handleJobChange(jobId: string) {
    const job = jobOptions.find(j => j.id === jobId);
    setForm({
      ...form,
      jobId: job?.id || undefined,
      jobName: job?.name ?? 'Overhead / General',
      jobType: job?.type ?? 'overhead',
    });
  }

  const filtered = data.expenses.filter(e => {
    if (filterCat !== 'all' && e.category !== filterCat) return false;
    if (filterJob !== 'all' && e.jobId !== filterJob) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  // This month stats
  const thisMonth = data.expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const totalThisMonth = thisMonth.reduce((s, e) => s + e.amount, 0);

  // By category this month
  const byCat = (Object.keys(CAT_LABELS) as ExpenseCategory[]).map(cat => ({
    cat,
    total: thisMonth.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(x => x.total > 0);

  // By job this month
  const byJob = data.contracts.map(c => ({
    name: c.clientName,
    total: thisMonth.filter(e => e.jobId === c.id).reduce((s,e) => s+e.amount, 0),
  })).filter(x => x.total > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Expenses"
        subtitle="Track actual job expenses — fuel, materials, equipment, subcontractors"
        action={<button className="btn-primary" onClick={() => open()}>+ Log Expense</button>}
      />

      {/* Month summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center col-span-2 md:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Total This Month</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalThisMonth)}</p>
        </div>
        {byCat.map(({ cat, total }) => (
          <div key={cat} className="card text-center">
            <p className="text-xs text-gray-500 mb-1">{CAT_LABELS[cat]}</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(total)}</p>
          </div>
        ))}
      </div>

      {byJob.length > 0 && (
        <div className="card mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Expenses by Job — {now.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
          <div className="space-y-2">
            {byJob.map(({ name, total }) => (
              <div key={name} className="flex items-center gap-3">
                <p className="text-sm font-medium text-gray-800 w-48 shrink-0 truncate">{name}</p>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min((total / (totalThisMonth || 1)) * 100, 100)}%` }} />
                </div>
                <p className="text-sm text-amber-600 w-24 text-right font-semibold">{formatCurrency(total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select className="input max-w-xs" value={filterCat} onChange={e => setFilterCat(e.target.value as ExpenseCategory | 'all')}>
          <option value="all">All Categories</option>
          {(Object.entries(CAT_LABELS) as [ExpenseCategory, string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-xs" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {data.contracts.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
          {data.projects.map(p => <option key={p.id} value={p.id}>{p.projectNumber} · {p.clientName}</option>)}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Date','Job','Category','Description','Amount',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">No expenses yet. <button className="text-[#27AE60] hover:underline" onClick={() => open()}>Log one →</button></td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.date}</td>
                <td className="px-4 py-3 text-gray-700">{e.jobName}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[e.category]}`}>
                    {CAT_LABELS[e.category]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-800">{e.description}</td>
                <td className="px-4 py-3 font-semibold text-amber-600">{formatCurrency(e.amount)}</td>
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
                <td colSpan={4} className="px-4 py-2 text-gray-600">Total</td>
                <td className="px-4 py-2 text-amber-600">{formatCurrency(filtered.reduce((s,e) => s+e.amount,0))}</td>
                <td></td>
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
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
              <div>
                <label className="label">Amount ($)</label>
                <input className="input" type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({...form, amount: Number(e.target.value)})} />
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value as ExpenseCategory})}>
                  {(Object.entries(CAT_LABELS) as [ExpenseCategory, string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Job / Contract</label>
                <select className="input" value={form.jobId ?? ''} onChange={e => handleJobChange(e.target.value)}>
                  {jobOptions.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Description *</label>
                <input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="What was this expense for?" />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Receipt #, vendor, etc." />
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={save}>Save Expense</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
