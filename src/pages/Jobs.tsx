import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type {
  AppData, Job, JobCostCode, JobProjectionSnapshot, CostCodeCategory,
  LandscapingProject, ProjectStatus, Contract, EstimateLineItem,
} from '../types';
import { COST_CODE_LABELS } from '../types';
import { calcLineItemTotals as calcLIT } from '../types';
import { saveData } from '../utils/storage';
import {
  formatCurrency, formatPercent,
  calcJobCostingForProject, generateProjectNumber,
} from '../utils/calculations';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void; }
type MainTab = 'maintenance' | 'landscaping';

// ─── Snow classifier (mirrors QuoteDetail) ────────────────────────────────────
const SNOW_IDS = new Set(['svc16','svc17','svc18','svc19','svc20','snow_trip']);
function isSnowItem(i: EstimateLineItem) {
  return SNOW_IDS.has(i.catalogItemId ?? '') || i.isSnowPerTrip === true;
}

// ─── Drill-down builder ───────────────────────────────────────────────────────
interface DrillLine { label: string; amount: number; }

function buildDrillDown(
  category: CostCodeCategory,
  job: Job,
  contract: Contract,
  data: AppData,
): DrillLine[] {
  const s = data.settings;
  const burden = 1 + (s.payrollBurdenPercent ?? 0) / 100;
  const crew = job.crewId ? data.crews.find(c => c.id === job.crewId) : null;
  const blendedRate = crew && crew.memberIds.length > 0
    ? data.employees.filter(e => crew.memberIds.includes(e.id)).reduce((sum, e) => sum + e.hourlyRate * burden, 0)
    : (s.laborRatePerHour ?? 22) * burden;

  const activeItems  = contract.lineItems.filter(i => !i.optional);
  const maintItems   = activeItems.filter(i => !isSnowItem(i) && !i.isOneTime);
  const snowItems    = activeItems.filter(i => isSnowItem(i));
  const activeMonths = contract.activeMonths?.length ?? 9;
  const totalVisits  = job.visitsPerMonth * activeMonths;
  const totalSnowEvents = (s.snowEvents4in ?? 5) + (s.snowEvents1_5in ?? 10) + (s.snowEventsDusting ?? 8);

  if (category === 'labor') {
    const lines: DrillLine[] = [];
    maintItems.forEach(li => {
      const hrs = li.estimatedHours ?? 0;
      if (hrs <= 0) return;
      lines.push({
        label: `${li.name}: ${hrs.toFixed(2)} hrs/visit × ${totalVisits} visits @ $${blendedRate.toFixed(0)}/hr`,
        amount: hrs * totalVisits * blendedRate,
      });
    });
    if (job.driveTimeMinutes > 0) {
      const dtHrs = job.driveTimeMinutes / 60;
      lines.push({
        label: `Drive time: ${job.driveTimeMinutes} min/visit × ${totalVisits} visits @ $${blendedRate.toFixed(0)}/hr`,
        amount: dtHrs * totalVisits * blendedRate,
      });
    }
    if (snowItems.length > 0) {
      const snowHrsPerEvent = snowItems.reduce((sum, i) => sum + (i.estimatedHours ?? 0), 0);
      if (snowHrsPerEvent > 0) {
        lines.push({
          label: `Snow labor: ${snowHrsPerEvent.toFixed(1)} hrs/event × ${totalSnowEvents} events @ $${blendedRate.toFixed(0)}/hr`,
          amount: snowHrsPerEvent * totalSnowEvents * blendedRate,
        });
      }
    }
    return lines;
  }

  if (category === 'materials') {
    const lines: DrillLine[] = [];
    const matItems = maintItems.filter(i => !(i.estimatedHours ?? 0) && i.unitCost > 0);
    matItems.forEach(li => {
      lines.push({
        label: `${li.name}: ${li.qty} × $${li.unitCost.toFixed(2)} × ${activeMonths} mo`,
        amount: li.qty * li.unitCost * activeMonths,
      });
    });
    if (snowItems.length > 0) {
      const bagsPerTrip = 3;
      lines.push({
        label: `De-icing: ${totalSnowEvents} trips × ${bagsPerTrip} bags × $${(s.deicingCostPerBag ?? 15).toFixed(2)}/bag`,
        amount: totalSnowEvents * bagsPerTrip * (s.deicingCostPerBag ?? 15),
      });
    }
    return lines;
  }

  if (category === 'equipment') {
    const lines: DrillLine[] = [];
    const addEquipLines = (items: EstimateLineItem[], months: number, label: string) => {
      items.forEach(li => {
        if (!li.catalogItemId) return;
        const svc = data.serviceCatalog.find(sv => sv.id === li.catalogItemId);
        if (!svc?.equipmentIds?.length) return;
        svc.equipmentIds.forEach(eid => {
          const eq = data.equipment.find(e => e.id === eid);
          if (!eq) return;
          const mo = eq.paymentType === 'monthly_payment' ? eq.monthlyPaymentAmount : eq.monthlyDepreciation;
          lines.push({
            label: `${eq.name} (${li.name}): $${mo.toFixed(0)}/mo × ${months} mo${label}`,
            amount: mo * months,
          });
        });
      });
    };
    addEquipLines(maintItems, activeMonths, '');
    addEquipLines(snowItems, 5, ' snow');
    return lines;
  }

  return [];
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtDec(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ─── Status configs ────────────────────────────────────────────────────────────
const PROJ_STATUS_BADGE: Record<ProjectStatus, string> = {
  estimate: 'badge-yellow', approved: 'badge-blue', in_progress: 'badge-purple',
  completed: 'badge-green', invoiced: 'badge-gray', lost: 'badge-red',
};
const PROJ_STATUS_LABELS: Record<ProjectStatus, string> = {
  estimate: 'Estimate', approved: 'Approved', in_progress: 'In Progress',
  completed: 'Completed', invoiced: 'Invoiced', lost: 'Lost',
};

// ─── Projection helpers ────────────────────────────────────────────────────────
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

// ─── Maintenance Jobs Tab ─────────────────────────────────────────────────────
function MaintenanceTab({ data, setData }: Props) {
  const navigate = useNavigate();
  const [selectedId] = useState<string | null>(
    data.jobs.length > 0 ? data.jobs[0].id : null
  );
  const [detailTab, setDetailTab] = useState<'costcodes' | 'projections' | 'details'>('costcodes');
  const [editingCodes, setEditingCodes] = useState(false);
  const [codesDraft, setCodesDraft] = useState<JobCostCode[]>([]);
  const [showProjectionModal, setShowProjectionModal] = useState(false);
  const [projNotes, setProjNotes] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [expandedCodes, setExpandedCodes] = useState<Set<CostCodeCategory>>(new Set());

  const job = data.jobs.find(j => j.id === selectedId) ?? null;

  useEffect(() => { setNotesDraft(job?.notes ?? ''); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function save(updated: Job) {
    const newData = { ...data, jobs: data.jobs.map(j => j.id === updated.id ? updated : j) };
    setData(newData);
    saveData(newData);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
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
    <div className="flex gap-4" style={{ minHeight: 500 }}>
      {/* ── Left: job list ── */}
      <div className="w-56 shrink-0 flex flex-col gap-2">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Active Jobs</h2>
        {data.jobs.length === 0 && (
          <p className="text-xs text-gray-400 italic">No jobs yet. Convert a quote to a job from the Quotes page.</p>
        )}
        {data.jobs.map(j => {
          const c = data.contracts.find(ct => ct.id === j.contractId);
          return (
            <button
              key={j.id}
              onClick={() => navigate('/jobs/' + j.id)}
              className="text-left p-3 rounded-xl border transition-colors bg-white border-gray-200 hover:border-green-300 hover:shadow-sm"
            >
              <p className="font-semibold text-sm">{j.jobNumber}</p>
              <p className="text-xs mt-0.5 text-gray-500">{j.clientName}</p>
              <p className="text-xs text-gray-400">{j.title}</p>
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
              <div className="flex items-center gap-2 shrink-0">
                {showSaved && <span className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">Saved ✓</span>}
                <select className="input text-sm py-1" value={job.status}
                  onChange={e => updateField('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button className="btn-secondary text-sm px-3 py-1" onClick={() => navigate('/schedule')}>
                  📅 Schedule
                </button>
                <button className="btn-primary text-sm px-3 py-1" onClick={() => setShowProjectionModal(true)}>
                  + Post Projection
                </button>
              </div>
            </div>

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
              <button key={t} onClick={() => setDetailTab(t)}
                className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                  detailTab === t ? 'border-[#27AE60] text-[#27AE60]' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'costcodes' ? 'Cost Codes' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Cost Codes Tab ── */}
          {detailTab === 'costcodes' && (
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
                  {(editingCodes ? codesDraft : job.costCodes).flatMap(cc => {
                    const remaining  = Math.max(0, cc.budgeted - cc.actual);
                    const pctUsed    = cc.budgeted > 0 ? (cc.actual / cc.budgeted) * 100 : 0;
                    const over       = cc.actual > cc.budgeted;
                    const isExpanded = expandedCodes.has(cc.category);
                    const drillLines = !editingCodes && contract ? buildDrillDown(cc.category, job, contract, data) : [];
                    const canExpand  = drillLines.length > 0;

                    const toggleExpand = () => setExpandedCodes(prev => {
                      const next = new Set(prev);
                      if (next.has(cc.category)) next.delete(cc.category); else next.add(cc.category);
                      return next;
                    });

                    const mainRow = (
                      <tr key={cc.category} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2 font-semibold text-gray-800">
                          <div className="flex items-center gap-1.5">
                            {!editingCodes && (
                              <button
                                onClick={canExpand ? toggleExpand : undefined}
                                className={`text-[10px] w-4 text-center transition-colors ${canExpand ? 'text-gray-400 hover:text-gray-700 cursor-pointer' : 'text-gray-200 cursor-default'}`}
                              >
                                {canExpand ? (isExpanded ? '▼' : '▶') : '▶'}
                              </button>
                            )}
                            {COST_CODE_LABELS[cc.category]}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          {editingCodes
                            ? <input type="number" min="0" step="1" className="input w-28 text-sm py-1"
                                value={codesDraft.find(c => c.category === cc.category)?.budgeted ?? 0}
                                onChange={e => patchCode(cc.category, 'budgeted', Number(e.target.value))} />
                            : <span className="text-gray-700">{fmtDec(cc.budgeted)}</span>
                          }
                        </td>
                        <td className="py-3 px-2">
                          {editingCodes
                            ? <input type="number" min="0" step="1" className="input w-28 text-sm py-1"
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

                    const detailRows = isExpanded && !editingCodes ? drillLines.map((line, i) => (
                      <tr key={`${cc.category}_d${i}`} className="bg-blue-50/40 border-b border-blue-100/60">
                        <td className="py-1.5 pl-8 pr-2 text-xs text-gray-500 italic" colSpan={2}>{line.label}</td>
                        <td className="py-1.5 px-2 text-xs text-gray-500">{fmtDec(line.amount)}</td>
                        <td colSpan={3} />
                      </tr>
                    )) : [];

                    return [mainRow, ...detailRows];
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
          {detailTab === 'projections' && (
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
          {detailTab === 'details' && (
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
                  <textarea className="input" rows={3} value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    onBlur={() => { if (notesDraft !== job.notes) updateField('notes', notesDraft); }} />
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
