import { useState } from 'react';
import type { AppData, TimeEntry } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

function blankEntry(data: AppData): Omit<TimeEntry, 'id' | 'createdAt'> {
  return {
    date: new Date().toISOString().split('T')[0],
    employeeId: data.employees[0]?.id ?? '',
    employeeName: data.employees[0]?.name ?? '',
    jobType: 'contract',
    jobId: data.contracts[0]?.id,
    jobName: data.contracts[0]?.clientName ?? '',
    hours: 0,
    notes: '',
  };
}

export default function TimeTracking({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<TimeEntry | null>(null);
  const [form, setForm]           = useState(() => blankEntry(data));
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterJob, setFilterJob] = useState('all');

  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  // Jobs dropdown: contracts + projects + general
  const jobOptions = [
    ...data.contracts.map(c => ({ id: c.id, name: c.clientName, type: 'contract' as const })),
    ...data.projects.map(p => ({ id: p.id, name: `${p.projectNumber} · ${p.clientName}`, type: 'project' as const })),
    { id: '', name: 'General / Admin', type: 'general' as const },
  ];

  function open(e?: TimeEntry) {
    if (e) { setEditing(e); setForm({ ...e }); }
    else   { setEditing(null); setForm(blankEntry(data)); }
    setShowModal(true);
  }

  function save() {
    if (!form.employeeId) { alert('Select an employee'); return; }
    if (!form.hours || form.hours <= 0) { alert('Enter hours greater than 0'); return; }
    const now2 = new Date().toISOString();
    let updated: AppData;
    if (editing) {
      updated = { ...data, timeEntries: data.timeEntries.map(t => t.id === editing.id ? { ...editing, ...form } : t) };
    } else {
      updated = { ...data, timeEntries: [...data.timeEntries, { id: `te_${Date.now()}`, ...form, createdAt: now2 }] };
    }
    setData(updated); saveData(updated); setShowModal(false);
  }

  function del(id: string) {
    if (!confirm('Delete this time entry?')) return;
    const updated = { ...data, timeEntries: data.timeEntries.filter(t => t.id !== id) };
    setData(updated); saveData(updated);
  }

  function handleEmployeeChange(empId: string) {
    const emp = data.employees.find(e => e.id === empId);
    setForm({ ...form, employeeId: empId, employeeName: emp?.name ?? '' });
  }

  function handleJobChange(jobId: string) {
    const job = jobOptions.find(j => j.id === jobId);
    setForm({
      ...form,
      jobId: job?.id || undefined,
      jobName: job?.name ?? 'General / Admin',
      jobType: job?.type ?? 'general',
    });
  }

  // Filtered entries
  const filtered = data.timeEntries.filter(t => {
    if (filterEmp !== 'all' && t.employeeId !== filterEmp) return false;
    if (filterJob !== 'all' && t.jobId !== filterJob) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  // This month stats
  const thisMonthEntries = data.timeEntries.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const totalHoursMonth = thisMonthEntries.reduce((s, t) => s + t.hours, 0);
  const blendedRate     = data.settings.laborRatePerHour;
  const laborCostMonth  = totalHoursMonth * blendedRate;

  // Hours by employee this month
  const byEmployee = data.employees.map(emp => {
    const hrs = thisMonthEntries.filter(t => t.employeeId === emp.id).reduce((s,t) => s+t.hours, 0);
    return { emp, hrs, cost: hrs * emp.hourlyRate };
  }).filter(x => x.hrs > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Time Tracking"
        subtitle="Log daily hours by employee and job"
        action={<button className="btn-primary" onClick={() => open()}>+ Log Hours</button>}
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
          <p className="text-xs text-gray-400">{blendedRate}/hr blended rate</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Entries</p>
          <p className="text-3xl font-bold text-gray-900">{data.timeEntries.length}</p>
        </div>
      </div>

      {/* Employee breakdown this month */}
      {byEmployee.length > 0 && (
        <div className="card mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Hours by Employee — {now.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
          <div className="space-y-2">
            {byEmployee.map(({ emp, hrs, cost }) => (
              <div key={emp.id} className="flex items-center gap-3">
                <p className="text-sm font-medium text-gray-800 w-40 shrink-0">{emp.name}</p>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#27AE60] rounded-full" style={{ width: `${Math.min((hrs / (totalHoursMonth || 1)) * 100, 100)}%` }} />
                </div>
                <p className="text-sm text-gray-700 w-16 text-right">{hrs.toFixed(1)} hrs</p>
                <p className="text-sm text-amber-600 w-20 text-right">{formatCurrency(cost)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <div className="flex gap-3 mb-4">
        <select className="input max-w-xs" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="all">All Employees</option>
          {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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
              {['Date','Employee','Job','Hours','Labor Cost','Notes',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No entries yet. <button className="text-[#27AE60] hover:underline" onClick={() => open()}>Log hours →</button></td></tr>
            ) : filtered.map(t => {
              const emp  = data.employees.find(e => e.id === t.employeeId);
              const cost = t.hours * (emp?.hourlyRate ?? blendedRate);
              return (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.employeeName}</td>
                  <td className="px-4 py-3 text-gray-600">{t.jobName}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{t.hours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-amber-600">{formatCurrency(cost)}</td>
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
                <td colSpan={3} className="px-4 py-2 text-gray-600">Total</td>
                <td className="px-4 py-2 text-gray-900">{filtered.reduce((s,t) => s+t.hours,0).toFixed(1)} hrs</td>
                <td className="px-4 py-2 text-amber-600">
                  {formatCurrency(filtered.reduce((s,t) => {
                    const emp = data.employees.find(e => e.id === t.employeeId);
                    return s + t.hours * (emp?.hourlyRate ?? blendedRate);
                  }, 0))}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Log Hours Modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Time Entry' : 'Log Hours'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
              <div>
                <label className="label">Hours</label>
                <input className="input" type="number" step="0.5" value={form.hours || ''} onChange={e => setForm({...form, hours: Number(e.target.value)})} />
              </div>
              <div>
                <label className="label">Employee</label>
                <select className="input" value={form.employeeId} onChange={e => handleEmployeeChange(e.target.value)}>
                  {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Job / Contract</label>
                <select className="input" value={form.jobId ?? ''} onChange={e => handleJobChange(e.target.value)}>
                  {jobOptions.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="What was done..." />
              </div>
            </div>
            {form.hours > 0 && (() => {
              const emp  = data.employees.find(e => e.id === form.employeeId);
              const cost = form.hours * (emp?.hourlyRate ?? blendedRate);
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  Labor cost: <strong>{formatCurrency(cost)}</strong>
                  <span className="text-gray-500 ml-2">({form.hours}h × ${emp?.hourlyRate ?? blendedRate}/hr)</span>
                </div>
              );
            })()}
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
