import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type {
  AppData, LandscapingProject, ProjectStatus, EstimateLineItem,
} from '../types';
import { calcLineItemTotals as calcLIT } from '../types';
// EstimateLineItem is used in LandscapingTab's addLineItem/updateLineItem
import { saveData } from '../utils/storage';
import {
  formatCurrency, formatPercent,
  calcJobCostingForProject, generateProjectNumber,
} from '../utils/calculations';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void; }
type MainTab = 'maintenance' | 'landscaping';

// ─── Status configs ────────────────────────────────────────────────────────────
const PROJ_STATUS_BADGE: Record<ProjectStatus, string> = {
  estimate: 'badge-yellow', approved: 'badge-blue', in_progress: 'badge-purple',
  completed: 'badge-green', invoiced: 'badge-gray', lost: 'badge-red',
};
const PROJ_STATUS_LABELS: Record<ProjectStatus, string> = {
  estimate: 'Estimate', approved: 'Approved', in_progress: 'In Progress',
  completed: 'Completed', invoiced: 'Invoiced', lost: 'Lost',
};

// ─── Blank project ─────────────────────────────────────────────────────────────
function blankProject(): Omit<LandscapingProject, 'id' | 'projectNumber' | 'createdAt'> {
  return {
    clientId: undefined, clientName: '', address: '', description: '',
    status: 'approved', startDate: '', endDate: '',
    estimatedHours: 0, estimatedMaterialCost: 0,
    lineItems: [], subtotalRevenue: 0, totalCost: 0, grossMargin: 0,
    crewId: undefined, notes: '',
  };
}

// ─── Landscaping Projects Tab ─────────────────────────────────────────────────
function LandscapingTab({ data, setData, openProjectId }: Props & { openProjectId?: string }) {
  const [showModal, setShowModal]     = useState(false);
  const initProject = openProjectId ? (data.projects.find(p => p.id === openProjectId) ?? null) : null;
  const [viewProject, setViewProject] = useState<LandscapingProject | null>(initProject);
  const [editing, setEditing]         = useState<LandscapingProject | null>(null);
  const [form, setForm]               = useState(blankProject());
  const [showArchived, setShowArchived] = useState(false);

  function open(p?: LandscapingProject) {
    if (p) { setEditing(p); setForm({ ...p }); }
    else   { setEditing(null); setForm(blankProject()); }
    setShowModal(true);
  }

  function save() {
    if (!form.clientName.trim()) { alert('Client name required'); return; }
    const now = new Date().toISOString();
    let updated: AppData;
    if (editing) {
      updated = { ...data, projects: data.projects.map(p => p.id === editing.id ? { ...p, ...form } : p) };
    } else {
      const pn = generateProjectNumber(data.projectCounter);
      updated = {
        ...data,
        projectCounter: data.projectCounter + 1,
        projects: [...data.projects, { id: `proj_${Date.now()}`, projectNumber: pn, ...form, createdAt: now }],
      };
    }
    setData(updated); saveData(updated); setShowModal(false);
  }

  function del(id: string) {
    if (!confirm('Delete this project?')) return;
    const updated = { ...data, projects: data.projects.filter(p => p.id !== id) };
    setData(updated); saveData(updated); setViewProject(null);
  }

  function updateStatus(id: string, status: ProjectStatus) {
    const updated = { ...data, projects: data.projects.map(p => p.id === id ? { ...p, status } : p) };
    setData(updated); saveData(updated);
    setViewProject(prev => prev?.id === id ? { ...prev, status } : prev);
  }

  function addLineItem() {
    const item: EstimateLineItem = {
      id: `li_${Date.now()}`, name: '', description: '', qty: 1, unit: 'each',
      unitCost: 0, unitPrice: 0, optional: false, taxable: false, notes: '',
    };
    const items = [...form.lineItems, item];
    setForm({ ...form, lineItems: items, ...calcLIT(items) });
  }

  function updateLineItem(idx: number, field: keyof EstimateLineItem, value: string | number | boolean) {
    const items = form.lineItems.map((li, i) => i === idx ? { ...li, [field]: value } : li);
    setForm({ ...form, lineItems: items, ...calcLIT(items) });
  }

  function removeLineItem(idx: number) {
    const items = form.lineItems.filter((_, i) => i !== idx);
    setForm({ ...form, lineItems: items, ...calcLIT(items) });
  }

  const activeProjects    = data.projects.filter(p => ['approved','in_progress'].includes(p.status));
  const completedProjects = data.projects.filter(p => p.status === 'completed');
  const archivedProjects  = data.projects.filter(p => p.status === 'invoiced');
  const totalValue        = activeProjects.reduce((s, p) => s + p.subtotalRevenue, 0);

  function ProjectRow({ p, archived = false }: { p: LandscapingProject; archived?: boolean }) {
    const jc = calcJobCostingForProject(p, data);
    return (
      <tr className={`hover:bg-gray-50 cursor-pointer ${archived ? 'opacity-60' : ''}`} onClick={() => setViewProject(p)}>
        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.projectNumber}</td>
        <td className="px-4 py-3">
          <p className="font-semibold text-gray-900">{p.clientName}</p>
          <p className="text-xs text-gray-400">{p.address}</p>
        </td>
        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{p.description}</td>
        <td className="px-4 py-3 font-semibold text-[#27AE60]">{formatCurrency(p.subtotalRevenue)}</td>
        <td className="px-4 py-3 text-amber-600">{formatCurrency(jc.estimatedCost)}</td>
        <td className={`px-4 py-3 font-medium ${p.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
          {formatPercent(p.grossMargin)}
        </td>
        <td className="px-4 py-3">
          <span className={PROJ_STATUS_BADGE[p.status]}>{PROJ_STATUS_LABELS[p.status]}</span>
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(p)}>Edit</button>
        </td>
      </tr>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{activeProjects.length}</span> active project{activeProjects.length !== 1 ? 's' : ''} ·
          Total: <span className="font-semibold text-[#27AE60]">{formatCurrency(totalValue)}</span>
        </div>
        <button className="btn-primary text-sm" onClick={() => open()}>+ New Project</button>
      </div>

      {activeProjects.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No active landscaping projects</p>
          <button className="btn-primary" onClick={() => open()}>Create first project</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#','Client','Description','Revenue','Est. Cost','Margin','Status',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeProjects.map(p => <ProjectRow key={p.id} p={p} />)}
            </tbody>
          </table>
        </div>
      )}

      {completedProjects.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-500 mb-2">Completed ({completedProjects.length})</p>
          <div className="card p-0 overflow-hidden opacity-80">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#','Client','Description','Revenue','Est. Cost','Margin','Status',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {completedProjects.map(p => <ProjectRow key={p.id} p={p} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {archivedProjects.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3"
            onClick={() => setShowArchived(!showArchived)}>
            <span>{showArchived ? '▼' : '▶'}</span>
            <span>Archived / Invoiced ({archivedProjects.length})</span>
          </button>
          {showArchived && (
            <div className="card p-0 overflow-hidden opacity-75">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['#','Client','Description','Revenue','Est. Cost','Margin','Status',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {archivedProjects.map(p => <ProjectRow key={p.id} p={p} archived />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View Modal */}
      {viewProject && (
        <Modal title={`${viewProject.projectNumber} · ${viewProject.clientName}`} onClose={() => setViewProject(null)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-gray-500">Description</p><p className="font-medium">{viewProject.description || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Address</p><p className="font-medium">{viewProject.address || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Start → End</p><p className="font-medium">{viewProject.startDate || '—'} → {viewProject.endDate || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Est. Hours</p><p className="font-medium">{viewProject.estimatedHours} hrs</p></div>
            </div>

            {(() => {
              const jc = calcJobCostingForProject(viewProject, data);
              const hasActual = jc.actualHours > 0 || jc.actualExpenses > 0;
              return (
                <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Est. Revenue</p>
                    <p className="text-xl font-bold text-[#27AE60]">{formatCurrency(jc.estimatedRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600">Est. Cost</p>
                    <p className="text-xl font-bold text-amber-600">{formatCurrency(jc.estimatedCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Margin</p>
                    <p className={`text-xl font-bold ${viewProject.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                      {formatPercent(viewProject.grossMargin)}
                    </p>
                  </div>
                  {hasActual && (
                    <>
                      <div><p className="text-xs text-gray-500">Actual Hours</p><p className="text-lg font-bold text-gray-800">{jc.actualHours.toFixed(1)} hrs</p></div>
                      <div><p className="text-xs text-gray-500">Actual Cost</p><p className="text-lg font-bold text-gray-800">{formatCurrency(jc.actualCost)}</p></div>
                      <div>
                        <p className="text-xs text-gray-500">Variance</p>
                        <p className={`text-lg font-bold ${jc.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {jc.variance >= 0 ? `+${formatCurrency(jc.variance)}` : formatCurrency(jc.variance)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            <div className="flex gap-3 pt-2 border-t">
              <select className="input flex-1" value={viewProject.status}
                onChange={e => updateStatus(viewProject.id, e.target.value as ProjectStatus)}>
                <option value="approved">Approved</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="invoiced">Invoiced (Archive)</option>
              </select>
              <button className="btn-secondary" onClick={() => { open(viewProject); setViewProject(null); }}>Edit</button>
              <button className="btn-danger" onClick={() => del(viewProject.id)}>Delete</button>
              <button className="btn-secondary" onClick={() => setViewProject(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editing ? `Edit ${editing.projectNumber}` : 'New Landscaping Project'} onClose={() => setShowModal(false)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Client / Company Name *</label>
                <input className="input" value={form.clientName} onChange={e => setForm({...form, clientName: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="label">Project Description</label>
                <input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Backyard patio + sod install" />
              </div>
              <div className="col-span-2">
                <label className="label">Property Address</label>
                <input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
              </div>
              <div>
                <label className="label">Start Date</label>
                <input className="input" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
              </div>
              <div>
                <label className="label">End Date</label>
                <input className="input" type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
              </div>
              <div>
                <label className="label">Estimated Labor Hours</label>
                <input className="input" type="number" value={form.estimatedHours || ''} onChange={e => setForm({...form, estimatedHours: Number(e.target.value)})} />
              </div>
              <div>
                <label className="label">Estimated Material Cost ($)</label>
                <input className="input" type="number" value={form.estimatedMaterialCost || ''} onChange={e => setForm({...form, estimatedMaterialCost: Number(e.target.value)})} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value as ProjectStatus})}>
                  <option value="approved">Approved</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="invoiced">Invoiced (Archive)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Items</p>
                <button className="text-xs text-[#27AE60] hover:underline" onClick={addLineItem}>+ Add Line</button>
              </div>
              {form.lineItems.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No line items yet. Add services or materials.</p>
              ) : (
                <div className="space-y-2">
                  {form.lineItems.map((li, i) => (
                    <div key={li.id} className="grid grid-cols-12 gap-1 items-center text-xs bg-gray-50 rounded-lg p-2">
                      <input className="input col-span-4 text-xs py-1" placeholder="Name" value={li.name}
                        onChange={e => updateLineItem(i, 'name', e.target.value)} />
                      <input className="input col-span-1 text-xs py-1 text-center" type="number" placeholder="Qty" value={li.qty || ''}
                        onChange={e => updateLineItem(i, 'qty', Number(e.target.value))} />
                      <input className="input col-span-2 text-xs py-1" placeholder="Unit" value={li.unit}
                        onChange={e => updateLineItem(i, 'unit', e.target.value)} />
                      <input className="input col-span-2 text-xs py-1 text-amber-700" type="number" placeholder="Cost" value={li.unitCost || ''}
                        onChange={e => updateLineItem(i, 'unitCost', Number(e.target.value))} />
                      <input className="input col-span-2 text-xs py-1" type="number" placeholder="Price" value={li.unitPrice || ''}
                        onChange={e => updateLineItem(i, 'unitPrice', Number(e.target.value))} />
                      <button className="col-span-1 text-red-400 hover:text-red-600 text-center" onClick={() => removeLineItem(i)}>✕</button>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-semibold pt-1 px-2">
                    <span className="text-amber-600">Cost: {formatCurrency(form.totalCost)}</span>
                    <span className="text-[#27AE60]">Revenue: {formatCurrency(form.subtotalRevenue)}</span>
                    <span className={form.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}>
                      Margin: {formatPercent(form.grossMargin)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>

            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={save}>Save Project</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const JOB_STATUS_COLOR: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500',
  archived:  'bg-gray-200 text-gray-400',
};

// ─── Maintenance Jobs Tab ─────────────────────────────────────────────────────
function MaintenanceTab({ data, setData }: Props) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('active');

  function archiveJob(jobId: string, e: { stopPropagation(): void }) {
    e.stopPropagation();
    if (!confirm('Archive this job? It will be hidden from the active list.')) return;
    const newData = { ...data, jobs: data.jobs.map(j => j.id === jobId ? { ...j, status: 'archived' as const } : j) };
    setData(newData); saveData(newData);
  }

  const jobs = statusFilter === 'all'
    ? data.jobs
    : data.jobs.filter(j => j.status === statusFilter);

  return (
    <div className="card p-0">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
        <p className="font-semibold text-gray-800">
          Jobs <span className="text-gray-400 font-normal">({jobs.length})</span>
        </p>
        <select
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:border-[#27AE60]"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
          <option value="all">All Statuses</option>
        </select>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏗</p>
          <p className="font-medium">No jobs found</p>
          <p className="text-sm mt-1">Convert an approved quote to create a job</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Job #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Revenue/mo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Crew</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Dates</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => {
              const contract = data.contracts.find(c => c.id === j.contractId);
              const crew = j.crewId ? data.crews.find(c => c.id === j.crewId) : null;
              return (
                <tr
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="font-semibold text-sm text-gray-900">{j.jobNumber}</p>
                    <p className="text-xs text-gray-400 capitalize">{j.jobType}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm text-gray-900">{j.clientName}</p>
                    {j.title && <p className="text-xs text-gray-400">{j.title}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${JOB_STATUS_COLOR[j.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {j.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {contract ? formatCurrency(contract.monthlyRevenue) + '/mo' : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{crew?.name ?? 'Unassigned'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {j.startDate}{j.endDate ? ` → ${j.endDate}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {j.status !== 'archived' && (
                      <button
                        onClick={e => archiveJob(j.id, e)}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded transition-colors"
                      >Archive</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main Jobs Page ────────────────────────────────────────────────────────────
export default function Jobs({ data, setData }: Props) {
  const location  = useLocation();
  const navState  = (location.state ?? {}) as { tab?: MainTab; openProjectId?: string };
  const [tab, setTab] = useState<MainTab>(navState.tab ?? 'maintenance');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Maintenance contracts and landscaping projects</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'maintenance' as MainTab, label: 'Maintenance', count: data.jobs.filter(j => j.status === 'active').length },
          { key: 'landscaping' as MainTab, label: 'Landscaping Projects', count: data.projects.filter(p => ['approved','in_progress','completed'].includes(p.status)).length },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label} <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === 'maintenance' && <MaintenanceTab data={data} setData={setData} />}
      {tab === 'landscaping' && <LandscapingTab data={data} setData={setData} openProjectId={navState.openProjectId} />}
    </div>
  );
}
