import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import type {
  AppData, LandscapingProject, ProjectStatus, Contract, ContractStatus, EstimateLineItem,
  AccountingCodeBucket,
} from '../types';
import { ACCOUNTING_CODE_LABELS } from '../types';
import { saveData } from '../utils/storage';
import {
  formatCurrency, formatPercent,
  calcJobCostingForContract, calcJobCostingForProject, generateProjectNumber,
} from '../utils/calculations';
import { calcLineItemTotals as calcLIT } from '../types';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

interface Props { data: AppData; setData: (d: AppData) => void }
type MainTab = 'landscaping' | 'maintenance';

// ─── Status configs ────────────────────────────────────────────────────────────
// Note: 'lost' kept in type for Pipeline use, but not shown as an option in Jobs
const PROJ_STATUS_BADGE: Record<ProjectStatus, string> = {
  estimate: 'badge-yellow', approved: 'badge-blue', in_progress: 'badge-purple',
  completed: 'badge-green', invoiced: 'badge-gray', lost: 'badge-red',
};
const PROJ_STATUS_LABELS: Record<ProjectStatus, string> = {
  estimate: 'Estimate', approved: 'Approved', in_progress: 'In Progress',
  completed: 'Completed', invoiced: 'Invoiced', lost: 'Lost',
};
const CONTRACT_STATUS_BADGE: Record<ContractStatus, string> = {
  estimate: 'badge-yellow', draft: 'badge-gray', awaiting_response: 'badge-yellow',
  changes_requested: 'badge-orange', approved: 'badge-green',
  active: 'badge-green', closed: 'badge-gray', lost: 'badge-red',
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

  // Active = not estimate, not invoiced (archived), not lost
  const activeProjects   = data.projects.filter(p => ['approved','in_progress','completed'].includes(p.status));
  const archivedProjects = data.projects.filter(p => p.status === 'invoiced');
  const totalValue       = activeProjects.reduce((s, p) => s + p.subtotalRevenue, 0);

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

      {/* Archived section */}
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

// ─── Maintenance Contracts Tab ────────────────────────────────────────────────
function MaintenanceTab({ data, setData, openContractId }: Props & { openContractId?: string }) {
  const navigate = useNavigate();
  const initContract = openContractId ? (data.contracts.find(c => c.id === openContractId) ?? null) : null;
  const [viewContract, setViewContract]           = useState<Contract | null>(initContract);
  const [editHours, setEditHours]                 = useState<number>(initContract?.estimatedHoursPerVisit ?? 2);
  const [editSchedDay, setEditSchedDay]           = useState<number | undefined>(initContract?.scheduledDay);
  const [editSchedTime, setEditSchedTime]         = useState(initContract?.scheduledTime ?? '');
  const [editSchedDuration, setEditSchedDuration] = useState(initContract?.scheduledDurationMinutes ?? 120);
  const [showArchived, setShowArchived]           = useState(false);

  function updateStatus(id: string, status: ContractStatus) {
    const contract = data.contracts.find(c => c.id === id);
    if (!contract) return;
    const updated = { ...data, contracts: data.contracts.map(c => c.id === id ? { ...c, status } : c) };
    setData(updated); saveData(updated);
    setViewContract(prev => prev?.id === id ? { ...prev, status } : prev);
  }

  function saveScheduleAndHours() {
    if (!viewContract) return;
    const updated = { ...data, contracts: data.contracts.map(c =>
      c.id === viewContract.id ? {
        ...c,
        estimatedHoursPerVisit: editHours,
        scheduledDay: editSchedDay,
        scheduledTime: editSchedTime || undefined,
        scheduledDurationMinutes: editSchedDuration,
      } : c
    )};
    setData(updated); saveData(updated);
    setViewContract({ ...viewContract, estimatedHoursPerVisit: editHours, scheduledDay: editSchedDay, scheduledTime: editSchedTime || undefined, scheduledDurationMinutes: editSchedDuration });
  }

  function del(id: string) {
    if (!confirm('Delete this contract?')) return;
    const updated = { ...data, contracts: data.contracts.filter(c => c.id !== id) };
    setData(updated); saveData(updated); setViewContract(null);
  }


  const activeContracts   = data.contracts.filter(c => c.status === 'active');
  const archivedContracts = data.contracts.filter(c => c.status === 'closed');
  const totalMonthly      = activeContracts.reduce((s, c) => s + c.monthlyRevenue, 0);

  function ContractRow({ c, archived = false }: { c: Contract; archived?: boolean }) {
    const now = new Date();
    const jc  = calcJobCostingForContract(c, data, now.getMonth(), now.getFullYear());
    const variance = c.totalCost - jc.projectedCost;
    return (
      <tr className={`hover:bg-gray-50 cursor-pointer ${archived ? 'opacity-60' : ''}`} onClick={() => navigate(`/projects/${c.id}`)}>
        <td className="px-3 py-3 text-gray-400 font-mono text-xs">{c.estimateNumber}</td>
        <td className="px-3 py-3">
          <p className="font-semibold text-gray-900">{c.clientName}</p>
          <p className="text-xs text-gray-400">{c.address}</p>
        </td>
        <td className="px-3 py-3 font-semibold text-[#27AE60]">{formatCurrency(c.monthlyRevenue)}</td>
        <td className={`px-3 py-3 font-medium ${c.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
          {formatPercent(c.grossMargin)}
        </td>
        <td className="px-3 py-3 text-gray-700">{(c.estimatedHoursPerVisit ?? 2).toFixed(1)} hrs</td>
        <td className="px-3 py-3 text-gray-700">{jc.actualHours.toFixed(1)} hrs</td>
        <td className="px-3 py-3">
          <span className={`font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(jc.projectedCost)}
          </span>
          {' '}
          <span className={`text-xs ${variance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {variance >= 0 ? `▼${formatCurrency(variance)}` : `▲${formatCurrency(Math.abs(variance))}`}
          </span>
        </td>
        <td className="px-3 py-3">
          <span className={CONTRACT_STATUS_BADGE[c.status]}>{c.status}</span>
        </td>
        {!archived && (
          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
            <select className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-600"
              value={c.status} onChange={e => updateStatus(c.id, e.target.value as ContractStatus)}>
              <option value="active">Active</option>
              <option value="closed">Close (Archive)</option>
            </select>
          </td>
        )}
        {archived && <td className="px-3 py-3" />}
      </tr>
    );
  }

  return (
    <div>
      <div className="card mb-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500">Monthly Recurring Revenue (Active)</p>
          <p className="text-2xl font-bold text-[#27AE60]">{formatCurrency(totalMonthly)}/mo</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/estimator')}>+ New Estimate</button>
      </div>

      <div className="card p-0 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['#','Client','Monthly','Margin','Est. Hrs/Visit','Actual Hrs (mo)','Projected Cost','Status',''].map(h => (
                <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeContracts.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                No active jobs. Win an estimate in the <button className="text-[#27AE60] hover:underline" onClick={() => navigate('/pipeline')}>Pipeline →</button>
              </td></tr>
            ) : (
              activeContracts.map(c => <ContractRow key={c.id} c={c} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Archived section */}
      {archivedContracts.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3"
            onClick={() => setShowArchived(!showArchived)}>
            <span>{showArchived ? '▼' : '▶'}</span>
            <span>Archived / Closed ({archivedContracts.length})</span>
          </button>
          {showArchived && (
            <div className="card p-0 overflow-hidden opacity-75">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['#','Client','Monthly','Margin','Est. Hrs/Visit','Actual Hrs (mo)','Projected Cost','Status',''].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {archivedContracts.map(c => <ContractRow key={c.id} c={c} archived />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Contract Detail Modal */}
      {viewContract && (
        <Modal title={`${viewContract.estimateNumber} · ${viewContract.clientName}`} onClose={() => setViewContract(null)} size="lg">
          <div className="space-y-4">
            {(() => {
              const now = new Date();
              const jc = calcJobCostingForContract(viewContract, data, now.getMonth(), now.getFullYear());
              return (
                <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4 text-center text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Est. Cost/mo</p>
                    <p className="text-lg font-bold text-amber-600">{formatCurrency(jc.estimatedCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Actual Cost (this mo)</p>
                    <p className="text-lg font-bold text-gray-800">{formatCurrency(jc.actualCost)}</p>
                    <p className="text-xs text-gray-400">{jc.actualHours.toFixed(1)} hrs logged</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Projected Cost/mo</p>
                    <p className="text-lg font-bold text-gray-800">{formatCurrency(jc.projectedCost)}</p>
                    <p className={`text-xs font-semibold ${jc.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {jc.variance >= 0 ? `${formatCurrency(jc.variance)} under` : `${formatCurrency(Math.abs(jc.variance))} over`}
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-blue-800">Estimated Hours / Visit</p>
                  <p className="text-xs text-blue-600">Drives projected cost calculations</p>
                </div>
                <input className="input w-24 text-center font-bold" type="number" step="0.5"
                  value={editHours} onChange={e => setEditHours(Number(e.target.value))} />
              </div>
              <div className="border-t border-blue-200 pt-3">
                <p className="text-xs font-semibold text-blue-800 mb-2">Weekly Schedule</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label text-xs">Day of Week</label>
                    <select className="input text-xs" value={editSchedDay ?? ''} onChange={e => setEditSchedDay(e.target.value === '' ? undefined : Number(e.target.value))}>
                      <option value="">Not set</option>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Start Time</label>
                    <input className="input text-xs" type="time" value={editSchedTime} onChange={e => setEditSchedTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Duration (min)</label>
                    <input className="input text-xs" type="number" step="15" value={editSchedDuration} onChange={e => setEditSchedDuration(Number(e.target.value))} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button className="btn-primary text-sm px-3" onClick={saveScheduleAndHours}>Save Hours + Schedule</button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</p>
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Service</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold text-amber-600">My Cost</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500">Price</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {viewContract.lineItems.filter(li => !li.optional).map(li => (
                      <tr key={li.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{li.name}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{li.qty} {li.unit}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{formatCurrency(li.unitCost)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(li.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(li.qty * li.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t">
                      <td colSpan={2} className="px-3 py-2 font-bold text-xs uppercase text-gray-600">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-600">{formatCurrency(viewContract.totalCost)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-bold text-[#27AE60]">{formatCurrency(viewContract.monthlyRevenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {viewContract.notes && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-gray-700">{viewContract.notes}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t">
              <select className="input flex-1" value={viewContract.status}
                onChange={e => updateStatus(viewContract.id, e.target.value as ContractStatus)}>
                <option value="active">Active Contract</option>
                <option value="closed">Closed (Archive)</option>
              </select>
              <button className="btn-danger" onClick={() => del(viewContract.id)}>Delete</button>
              <button className="btn-secondary" onClick={() => setViewContract(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Job Detail Page ───────────────────────────────────────────────────────────
function JobDetailPage({ data, setData: _setData }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const contract = data.contracts.find(c => c.id === id);

  if (!contract) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => navigate('/projects')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back to Jobs</button>
        <p className="text-gray-500">Job not found.</p>
      </div>
    );
  }

  const codes = contract.costingCodes;
  const maintTotal   = codes?.maintenance.reduce((s, c) => s + c.budgeted, 0) ?? 0;
  const maintActual  = codes?.maintenance.reduce((s, c) => s + c.actual, 0) ?? 0;
  const snowTotal    = codes?.snow.reduce((s, c) => s + c.budgeted, 0) ?? 0;
  const snowActual   = codes?.snow.reduce((s, c) => s + c.actual, 0) ?? 0;

  function CodeBuckets({ buckets, label }: { buckets: AccountingCodeBucket[]; label: string }) {
    const total = buckets.reduce((s, b) => s + b.budgeted, 0);
    const actualTotal = buckets.reduce((s, b) => s + b.actual, 0);
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">{label}</h3>
          <div className="text-right">
            <p className="text-xs text-gray-400">Budgeted</p>
            <p className="font-bold text-gray-900">{formatCurrency(total)}</p>
          </div>
        </div>
        <div className="space-y-3">
          {buckets.map(b => {
            const pct = b.budgeted > 0 ? Math.min((b.actual / b.budgeted) * 100, 100) : 0;
            const over = b.actual > b.budgeted && b.budgeted > 0;
            return (
              <div key={b.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{ACCOUNTING_CODE_LABELS[b.category]}</span>
                  <span className="text-gray-500">
                    {formatCurrency(b.actual)} <span className="text-gray-300">/</span> {formatCurrency(b.budgeted)} budgeted
                    {over && <span className="ml-1 text-red-500 text-xs font-semibold">OVER</span>}
                  </span>
                </div>
                {b.budgeted > 0 ? (
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : pct > 80 ? 'bg-yellow-400' : 'bg-[#27AE60]'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                ) : (
                  <div className="h-2 bg-gray-100 rounded-full" />
                )}
                {b.notes && <p className="text-[11px] text-gray-400 mt-0.5">{b.notes}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-sm">
          <span className="text-gray-500">Total actual spent</span>
          <span className={`font-semibold ${actualTotal > total ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(actualTotal)}</span>
        </div>
      </div>
    );
  }

  const annualRev     = contract.annualRevenue;
  const monthlyRev    = contract.monthlyRevenue;
  const budgetedCost  = maintTotal + snowTotal;
  const actualCost    = maintActual + snowActual;
  const budgetedProfit    = annualRev - budgetedCost;
  const budgetedMarginPct = annualRev > 0 ? (budgetedProfit / annualRev) * 100 : 0;
  const actualProfit      = annualRev - actualCost;
  const actualMarginPct   = annualRev > 0 ? (actualProfit / annualRev) * 100 : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/projects')} className="text-sm text-gray-400 hover:text-gray-600">← Jobs</button>
        <span className="text-gray-300">|</span>
        <span className="text-xs font-mono text-gray-400">#{contract.estimateNumber}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{contract.title || contract.clientName}</h1>
          <p className="text-sm text-gray-500 mt-1">{contract.clientName} · {[contract.city, contract.state].filter(Boolean).join(', ') || contract.address}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${CONTRACT_STATUS_BADGE[contract.status]}`}>
            {contract.status.replace('_',' ')}
          </span>
          <button onClick={() => navigate(`/quotes/${contract.id}`)} className="btn-secondary text-sm py-1.5 px-3">View Quote</button>
        </div>
      </div>

      {/* Revenue cards */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Revenue</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">Monthly Billing Rate</p>
            <p className="text-2xl font-bold text-[#27AE60]">{formatCurrency(monthlyRev)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
            <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(annualRev)} annual ÷ 12</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">Annual Contract Value</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(annualRev)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{contract.activeMonths?.length ?? 0} active months</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">Visits / Month</p>
            <p className="text-2xl font-bold text-gray-900">{contract.visitsPerMonth}</p>
            <p className="text-xs text-gray-400 mt-0.5">{contract.activeMonths?.length ?? 0} active months</p>
          </div>
        </div>
      </div>

      {/* Margin summary */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Margin Summary</p>
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 w-1/3" />
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500">Budgeted</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500">Actual</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-5 py-3 font-medium text-gray-700">Annual Revenue</td>
                <td className="px-5 py-3 text-right font-semibold text-[#27AE60]">{formatCurrency(annualRev)}</td>
                <td className="px-5 py-3 text-right font-semibold text-[#27AE60]">{formatCurrency(annualRev)}</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-5 py-3 font-medium text-gray-700">Total Cost</td>
                <td className="px-5 py-3 text-right text-amber-600">{formatCurrency(budgetedCost)}</td>
                <td className="px-5 py-3 text-right text-amber-600">{actualCost > 0 ? formatCurrency(actualCost) : <span className="text-gray-300">—</span>}</td>
              </tr>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-5 py-3 font-bold text-gray-800">Gross Profit</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold ${budgetedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(budgetedProfit)}</span>
                  <span className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded ${budgetedMarginPct >= data.settings.targetMargin ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{budgetedMarginPct.toFixed(1)}%</span>
                </td>
                <td className="px-5 py-3 text-right">
                  {actualCost > 0 ? (
                    <>
                      <span className={`font-bold ${actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(actualProfit)}</span>
                      <span className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded ${actualMarginPct >= data.settings.targetMargin ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{actualMarginPct.toFixed(1)}%</span>
                    </>
                  ) : <span className="text-gray-300 text-xs">No actuals yet</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost breakdown — accounting code buckets */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Cost Breakdown</p>
        {codes ? (
          <div className="space-y-4">
            <p className="text-xs text-gray-400 -mt-2">Budget from estimate · log actuals via Time Tracking &amp; Expenses</p>
            {codes.maintenance.length > 0 && (
              <CodeBuckets buckets={codes.maintenance} label="Lawn Maintenance" />
            )}
            {codes.snow.length > 0 && (
              <CodeBuckets buckets={codes.snow} label="❄ Snow Removal" />
            )}
          </div>
        ) : (
          <div className="card text-center py-8 text-gray-400">
            <p>No accounting codes — this job was activated before codes were added.</p>
            <p className="text-xs mt-1">Re-open the quote and click Activate to generate codes.</p>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="font-semibold text-gray-800">Estimate Line Items</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500">Service</th>
              <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">Qty</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Unit Cost</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Unit Price</th>
            </tr>
          </thead>
          <tbody>
            {contract.lineItems.map(li => (
              <tr key={li.id} className="border-b border-gray-50">
                <td className="px-5 py-2 text-gray-800">{li.name}</td>
                <td className="px-4 py-2 text-center text-gray-500">{li.qty} {li.unit}</td>
                <td className="px-4 py-2 text-right text-amber-600">{formatCurrency(li.unitCost)}</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(li.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Projects Page ────────────────────────────────────────────────────────
export default function Projects({ data, setData }: Props) {
  const { id } = useParams<{ id?: string }>();
  if (id) return <JobDetailPage data={data} setData={setData} />;

  const location  = useLocation();
  const navState  = (location.state ?? {}) as { tab?: MainTab; openContractId?: string; openProjectId?: string };
  const [tab, setTab] = useState<MainTab>(navState.tab ?? 'maintenance');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Jobs"
        subtitle="Manage maintenance contracts and one-time landscaping projects"
      />

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'maintenance' as MainTab, label: 'Maintenance Contracts', count: data.contracts.filter(c => c.status === 'active').length },
          { key: 'landscaping' as MainTab, label: 'Landscaping Projects',  count: data.projects.filter(p => ['approved','in_progress','completed'].includes(p.status)).length },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label} <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === 'maintenance' && <MaintenanceTab data={data} setData={setData} openContractId={navState.openContractId} />}
      {tab === 'landscaping' && <LandscapingTab data={data} setData={setData} openProjectId={navState.openProjectId} />}
    </div>
  );
}
