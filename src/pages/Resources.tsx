import { useState } from 'react';
import type {
  AppData, Equipment, Employee, OverheadItem, FieldSupply,
  SeasonType, OverheadCategory, ServiceCatalogItem, ServiceCategory,
  ContractTemplate, ContractTemplateType, SalesTaxRate, Subcontractor,
} from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency, formatPercent, calcMonthlyLaborCost } from '../utils/calculations';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

type Tab = 'overview' | 'rates' | 'labor' | 'material' | 'subcontractors' | 'equipment' | 'overhead' | 'efficiencies' | 'contracts';

interface Props { data: AppData; setData: (d: AppData) => void }

// ─── Shared helpers ────────────────────────────────────────────────────────────
const SEASON_OPTIONS: SeasonType[] = ['spring','summer','fall','winter'];
const LONGEVITY_OPTIONS = [
  { months: 3,   label: '3 months' },
  { months: 6,   label: '6 months' },
  { months: 12,  label: '1 year' },
  { months: 36,  label: '3 years' },
  { months: 60,  label: '5 years' },
  { months: 120, label: '10 years' },
];
function eqMonthlyCost(eq: { paymentType: string; monthlyPaymentAmount: number; monthlyDepreciation: number }) {
  return eq.paymentType === 'monthly_payment' ? eq.monthlyPaymentAmount : eq.monthlyDepreciation;
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: AppData }) {
  const monthlyLabor    = calcMonthlyLaborCost(data);
  const monthlyOverhead = data.overhead.reduce((s, o) => s + o.monthlyCost, 0);
  const monthlyDeprec   = data.equipment.reduce((s, e) => s + eqMonthlyCost(e), 0);
  const monthlySupplies = data.fieldSupplies.reduce((s, f) => s + f.unitCost * f.monthlyUsage, 0);
  const totalMonthlyCost = monthlyLabor + monthlyOverhead + monthlyDeprec + monthlySupplies;
  const margin = data.settings.targetMargin / 100;
  const revenueNeeded = margin < 1 ? totalMonthlyCost / (1 - margin) : totalMonthlyCost * 2;
  const burden = (data.settings.payrollBurdenPercent ?? 13) / 100;

  const costItems = [
    { label: 'Labor',             amount: monthlyLabor,    pct: totalMonthlyCost > 0 ? (monthlyLabor / totalMonthlyCost) * 100 : 0,    color: 'bg-[#27AE60]' },
    { label: 'Fixed Overhead',    amount: monthlyOverhead, pct: totalMonthlyCost > 0 ? (monthlyOverhead / totalMonthlyCost) * 100 : 0,  color: 'bg-blue-400'  },
    { label: 'Equipment Deprec.', amount: monthlyDeprec,   pct: totalMonthlyCost > 0 ? (monthlyDeprec / totalMonthlyCost) * 100 : 0,    color: 'bg-amber-400' },
    { label: 'Field Supplies',    amount: monthlySupplies, pct: totalMonthlyCost > 0 ? (monthlySupplies / totalMonthlyCost) * 100 : 0,  color: 'bg-purple-400'},
  ];

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">Monthly Cost</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalMonthlyCost)}</p>
          <p className="text-xs text-gray-400 mt-1">to keep doors open</p>
        </div>
        <div className="card p-4 border-l-4 border-l-[#27AE60]">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">Revenue Needed</p>
          <p className="text-2xl font-bold text-[#27AE60] mt-1">{formatCurrency(revenueNeeded)}</p>
          <p className="text-xs text-gray-400 mt-1">at {data.settings.targetMargin}% margin</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">Employees</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.employees.length}</p>
          <p className="text-xs text-gray-400 mt-1">{data.crews.length} crew{data.crews.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">Equipment</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.equipment.length}</p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(monthlyDeprec)}/mo depreciation</p>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-sm font-bold text-gray-700">Monthly Cost Breakdown</p>
        <div className="flex rounded-full overflow-hidden h-4">
          {costItems.map(c => (
            <div key={c.label} className={`${c.color} h-full`} style={{ width: `${c.pct}%` }} title={`${c.label}: ${formatCurrency(c.amount)}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          {costItems.map(c => (
            <div key={c.label} className="flex items-start gap-2">
              <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${c.color}`} />
              <div>
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className="text-sm font-semibold text-gray-800">{formatCurrency(c.amount)}<span className="text-xs font-normal text-gray-400">/mo</span></p>
                <p className="text-[10px] text-gray-400">{c.pct.toFixed(1)}% of costs</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-sm font-bold text-gray-700">Labor Snapshot</p>
        <div className="divide-y divide-gray-100">
          {data.employees.map(emp => {
            const totalCostHr = emp.hourlyRate * (1 + burden);
            const chargeHr    = margin < 1 ? totalCostHr / (1 - margin) : totalCostHr * 2;
            return (
              <div key={emp.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{emp.name} <span className="text-xs text-gray-400">— {emp.role}</span></p>
                  <p className="text-xs text-gray-400">{emp.hoursPerWeek} hrs/wk · ${emp.hourlyRate}/hr pay</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700">{formatCurrency(totalCostHr)}/hr cost</p>
                  <p className="text-xs text-[#27AE60]">{formatCurrency(chargeHr)}/hr charge</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold text-gray-700">Top Overhead Items</p>
          <p className="text-sm font-semibold text-gray-500">{formatCurrency(monthlyOverhead)}/mo total</p>
        </div>
        <div className="divide-y divide-gray-100">
          {[...data.overhead].sort((a,b) => b.monthlyCost - a.monthlyCost).slice(0,6).map(item => (
            <div key={item.id} className="flex justify-between items-center py-2 first:pt-0 last:pb-0">
              <p className="text-sm text-gray-700">{item.name} <span className="text-xs text-gray-400 capitalize">({item.category})</span></p>
              <p className="text-sm font-semibold text-gray-800">{formatCurrency(item.monthlyCost)}/mo</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 1-LABOR TAB ──────────────────────────────────────────────────────────────
function LaborTab({ data, setData }: Props) {
  const [showModal, setShowModal]         = useState(false);
  const [editing, setEditing]             = useState<Employee | null>(null);
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [editingCrew, setEditingCrew]     = useState<typeof data.crews[0] | null>(null);
  const [crewForm, setCrewForm]           = useState({ name: '', memberIds: [] as string[], equipmentIds: [] as string[], notes: '' });

  const blank = (): Omit<Employee,'id'> => ({ name:'', role:'', hourlyRate:0, hoursPerWeek:40, isOwner:false, startDate:'', notes:'' });
  const [form, setForm] = useState(blank());

  const burden = (data.settings.payrollBurdenPercent ?? 13) / 100;
  const margin = data.settings.targetMargin / 100;

  function open(emp?: Employee) {
    if (emp) { setEditing(emp); setForm({...emp}); }
    else      { setEditing(null); setForm(blank()); }
    setShowModal(true);
  }
  function save() {
    if (!form.name.trim()) { alert('Name required'); return; }
    let updated: AppData;
    if (editing) {
      updated = {...data, employees: data.employees.map(e => e.id === editing.id ? {...editing, ...form} : e)};
    } else {
      updated = {...data, employees: [...data.employees, {id:`emp_${Date.now()}`, ...form}]};
    }
    setData(updated); saveData(updated); setShowModal(false);
  }
  function del(id: string) {
    if (!confirm('Delete this employee?')) return;
    const updated = {...data, employees: data.employees.filter(e => e.id !== id)};
    setData(updated); saveData(updated);
  }

  function openCrew(crew?: typeof data.crews[0]) {
    if (crew) { setEditingCrew(crew); setCrewForm({name: crew.name, memberIds: [...crew.memberIds], equipmentIds: [...crew.equipmentIds], notes: crew.notes}); }
    else       { setEditingCrew(null); setCrewForm({name:'', memberIds:[], equipmentIds:[], notes:''}); }
    setShowCrewModal(true);
  }
  function saveCrew() {
    if (!crewForm.name.trim()) { alert('Crew name required'); return; }
    let updated: AppData;
    if (editingCrew) {
      updated = {...data, crews: data.crews.map(c => c.id === editingCrew.id ? {...editingCrew, ...crewForm} : c)};
    } else {
      updated = {...data, crews: [...data.crews, {id:`crew_${Date.now()}`, contractIds: [], ...crewForm}]};
    }
    setData(updated); saveData(updated); setShowCrewModal(false);
  }
  function delCrew(id: string) {
    if (!confirm('Delete this crew?')) return;
    const updated = {...data, crews: data.crews.filter(c => c.id !== id)};
    setData(updated); saveData(updated);
  }
  function toggleMember(id: string) {
    setCrewForm(f => ({ ...f, memberIds: f.memberIds.includes(id) ? f.memberIds.filter(x => x !== id) : [...f.memberIds, id] }));
  }
  function toggleEquip(id: string) {
    setCrewForm(f => ({ ...f, equipmentIds: f.equipmentIds.includes(id) ? f.equipmentIds.filter(x => x !== id) : [...f.equipmentIds, id] }));
  }

  const totalMonthlyCost = calcMonthlyLaborCost(data);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-500">Total monthly labor cost: <span className="font-semibold text-gray-800">{formatCurrency(totalMonthlyCost)}</span></p>
          <p className="text-xs text-gray-400 mt-0.5">Payroll burden: {data.settings.payrollBurdenPercent ?? 13}% — set in Efficiencies tab</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => open()}>+ Add Employee</button>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Name','Role','Pay Rate','Burden (~taxes)','Total Cost/hr','Suggested Charge','Margin','Hrs/Wk',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.employees.map(emp => {
              const totalCostHr  = emp.hourlyRate * (1 + burden);
              const chargeHr     = margin < 1 ? totalCostHr / (1 - margin) : totalCostHr * 2;
              const actualMargin = chargeHr > 0 ? ((chargeHr - totalCostHr) / chargeHr) * 100 : 0;
              const burdenDollar = emp.hourlyRate * burden;
              return (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {emp.name}
                    {emp.isOwner && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Owner</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{emp.role}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">${emp.hourlyRate}/hr</td>
                  <td className="px-4 py-3 text-amber-700">+{formatCurrency(burdenDollar)}/hr</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(totalCostHr)}/hr</td>
                  <td className="px-4 py-3 text-[#27AE60] font-semibold">{formatCurrency(chargeHr)}/hr</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actualMargin >= data.settings.targetMargin ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {formatPercent(actualMargin)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{emp.hoursPerWeek}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(emp)}>Edit</button>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => del(emp.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Crew Assignments */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Crew Assignments</h3>
          <button className="btn-secondary text-sm" onClick={() => openCrew()}>+ Add Crew</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.crews.map(crew => {
            const members   = data.employees.filter(e => crew.memberIds.includes(e.id));
            const equipment = data.equipment.filter(e => crew.equipmentIds.includes(e.id));
            const crewRate  = members.reduce((s, e) => s + e.hourlyRate, 0) * (1 + burden);
            return (
              <div key={crew.id} className="card p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{crew.name}</p>
                    {crewRate > 0 && (
                      <p className="text-sm font-bold text-[#27AE60] mt-0.5">
                        {formatCurrency(crewRate)}/hr
                        <span className="text-xs font-normal text-gray-400 ml-1">crew rate (incl. burden)</span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs text-[#27AE60] hover:underline" onClick={() => openCrew(crew)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => delCrew(crew.id)}>Del</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Members</p>
                  <div className="flex flex-wrap gap-1">
                    {members.map(m => (
                      <span key={m.id} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                        {m.name} <span className="opacity-60">${m.hourlyRate}/hr</span>
                      </span>
                    ))}
                    {members.length === 0 && <span className="text-xs text-gray-400">None assigned</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Equipment</p>
                  <div className="flex flex-wrap gap-1">
                    {equipment.map(e => <span key={e.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{e.name}</span>)}
                    {equipment.length === 0 && <span className="text-xs text-gray-400">None assigned</span>}
                  </div>
                </div>
                {crew.notes && <p className="text-xs text-gray-400 italic">{crew.notes}</p>}
              </div>
            );
          })}
          {data.crews.length === 0 && <p className="text-sm text-gray-400 col-span-2">No crews yet — add one above.</p>}
        </div>
      </div>

      {showModal && (
        <Modal title={editing ? `Edit ${editing.name}` : 'Add Employee'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Full Name</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><label className="label">Role / Title</label><input className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="e.g. Crew Leader" /></div>
              <div><label className="label">Start Date</label><input className="input" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} /></div>
              <div><label className="label">Hourly Rate ($)</label><input className="input" type="number" value={form.hourlyRate || ''} onChange={e => setForm({...form, hourlyRate: Number(e.target.value)})} /></div>
              <div><label className="label">Hours / Week</label><input className="input" type="number" value={form.hoursPerWeek || ''} onChange={e => setForm({...form, hoursPerWeek: Number(e.target.value)})} /></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.isOwner} onChange={e => setForm({...form, isOwner: e.target.checked})} className="accent-[#27AE60]" />
              Owner / Co-Owner
            </label>
            <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            {form.hourlyRate > 0 && (
              <div className="bg-green-50 rounded-lg p-3 text-sm space-y-1">
                <p>Pay rate: <strong>${form.hourlyRate}/hr</strong></p>
                <p>With {data.settings.payrollBurdenPercent ?? 13}% burden: <strong>{formatCurrency(form.hourlyRate * (1 + burden))}/hr total cost</strong></p>
                <p>Suggested charge: <strong>{formatCurrency(form.hourlyRate * (1 + burden) / (1 - margin))}/hr</strong></p>
              </div>
            )}
            <div className="flex gap-3"><button className="btn-primary flex-1" onClick={save}>Save</button><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}

      {showCrewModal && (
        <Modal title={editingCrew ? `Edit ${editingCrew.name}` : 'Add Crew'} onClose={() => setShowCrewModal(false)}>
          <div className="space-y-4">
            <div><label className="label">Crew Name</label><input className="input" value={crewForm.name} onChange={e => setCrewForm({...crewForm, name: e.target.value})} placeholder="e.g. Crew Alpha" /></div>
            <div>
              <label className="label">Members</label>
              <div className="space-y-1 mb-2">
                {data.employees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-gray-50">
                    <input type="checkbox" checked={crewForm.memberIds.includes(emp.id)} onChange={() => toggleMember(emp.id)} className="accent-[#27AE60]" />
                    <span className="flex-1">{emp.name} <span className="text-gray-400 text-xs">— {emp.role}</span></span>
                    <span className="text-xs font-medium text-gray-600">${emp.hourlyRate}/hr</span>
                  </label>
                ))}
              </div>
              {crewForm.memberIds.length > 0 && (() => {
                const selected = data.employees.filter(e => crewForm.memberIds.includes(e.id));
                const rawTotal = selected.reduce((s, e) => s + e.hourlyRate, 0);
                const crewRate = rawTotal * (1 + burden);
                return (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Crew Hourly Rate</p>
                    <div className="text-xs text-gray-600 space-y-0.5">
                      {selected.map(e => (
                        <div key={e.id} className="flex justify-between"><span>{e.name}</span><span>${e.hourlyRate}/hr</span></div>
                      ))}
                      <div className="flex justify-between border-t border-green-200 pt-1 mt-1"><span>Base total</span><span>${rawTotal}/hr</span></div>
                      <div className="flex justify-between font-semibold text-green-800 text-sm">
                        <span>+ {burden * 100}% burden = crew rate</span>
                        <span>{formatCurrency(crewRate)}/hr</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="label">Equipment</label>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.equipment.map(eq => (
                  <label key={eq.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={crewForm.equipmentIds.includes(eq.id)} onChange={() => toggleEquip(eq.id)} className="accent-[#27AE60]" />
                    {eq.name}
                  </label>
                ))}
              </div>
            </div>
            <div><label className="label">Notes</label><input className="input" value={crewForm.notes} onChange={e => setCrewForm({...crewForm, notes: e.target.value})} /></div>
            <div className="flex gap-3"><button className="btn-primary flex-1" onClick={saveCrew}>Save</button><button className="btn-secondary" onClick={() => setShowCrewModal(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RATES TAB (Service Catalog) ──────────────────────────────────────────────
const CAT_OPTIONS: ServiceCategory[] = ['maintenance','landscaping','snow','other'];
const CAT_LABELS: Record<ServiceCategory, string> = { maintenance:'Maintenance', landscaping:'Landscaping', snow:'Snow Removal', other:'Other' };
const CAT_COLORS: Record<ServiceCategory, string> = { maintenance:'bg-green-100 text-green-700', landscaping:'bg-blue-100 text-blue-700', snow:'bg-sky-100 text-sky-700', other:'bg-gray-100 text-gray-600' };

function RatesTab({ data, setData }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(data.serviceCatalog.length > 0 ? data.serviceCatalog[0].id : null);
  const [filterCat, setFilterCat]   = useState<ServiceCategory | 'all'>('all');
  const [form, setForm]             = useState<ServiceCatalogItem | null>(null);
  const [settingsForm, setSettingsForm] = useState({...data.settings});
  const [visitsPerMonth, setVisitsPerMonth] = useState(4);
  const [dirty, setDirty]           = useState(false);

  const catalogItem = data.serviceCatalog.find(s => s.id === selectedId) ?? null;
  const activeForm  = form ?? catalogItem;

  function select(id: string) {
    if (dirty && !confirm('You have unsaved changes. Discard them?')) return;
    setSelectedId(id); setForm(null); setDirty(false);
  }
  function patch(updates: Partial<ServiceCatalogItem>) {
    setForm(f => ({ ...(f ?? catalogItem!), ...updates })); setDirty(true);
  }
  function save() {
    if (!activeForm) return;
    const updated = { ...data, serviceCatalog: data.serviceCatalog.map(s => s.id === activeForm.id ? activeForm : s), settings: settingsForm };
    setData(updated); saveData(updated); setForm(null); setDirty(false);
  }
  function addNew() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    const id = `svc_${Date.now()}`;
    const blank: ServiceCatalogItem = { id, name: 'New Service', description: '', category: 'maintenance', unit: 'visit', defaultUnitCost: 0, defaultUnitPrice: 0, estimatedHours: 0, equipmentIds: [], taxable: false, notes: '' };
    const updated = { ...data, serviceCatalog: [...data.serviceCatalog, blank] };
    setData(updated); saveData(updated); setSelectedId(id); setForm(blank); setDirty(false);
  }
  function del(id: string) {
    if (!confirm('Delete this service?')) return;
    const updated = { ...data, serviceCatalog: data.serviceCatalog.filter(s => s.id !== id) };
    setData(updated); saveData(updated); setSelectedId(updated.serviceCatalog[0]?.id ?? null); setForm(null); setDirty(false);
  }
  function toggleEquipment(eqId: string) {
    const ids = activeForm?.equipmentIds ?? [];
    patch({ equipmentIds: ids.includes(eqId) ? ids.filter(i => i !== eqId) : [...ids, eqId] });
  }
  function toggleFutureEquipment(id: string) {
    const ids = activeForm?.futureEquipmentIds ?? [];
    patch({ futureEquipmentIds: ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id] });
  }

  const burden = 1 + (data.settings.payrollBurdenPercent ?? 13) / 100;
  const crewRates = data.crews.filter(c => c.memberIds.length > 0)
    .map(c => data.employees.filter(e => c.memberIds.includes(e.id)).reduce((s, e) => s + e.hourlyRate, 0) * burden);
  const blendedRate = crewRates.length > 0
    ? crewRates.reduce((s, r) => s + r, 0) / crewRates.length
    : data.employees.length > 0
      ? (data.employees.reduce((s, e) => s + e.hourlyRate, 0) / data.employees.length) * burden
      : (data.settings.laborRatePerHour ?? 22) * burden;

  const isMonthlyService = activeForm?.category === 'snow' || activeForm?.unit === 'month';
  const sfPerHour        = activeForm && activeForm.estimatedHours > 0 ? 1000 / activeForm.estimatedHours : 0;
  const hoursPerVisit    = sfPerHour > 0 ? 1 : 0;
  const laborPerVisit    = hoursPerVisit * blendedRate;
  const linkedEquip         = activeForm ? data.equipment.filter(e => activeForm.equipmentIds.includes(e.id)) : [];
  const futureBudgetEquip   = data.futureBudget.filter(i => i.category === 'equipment' || i.category === 'vehicle');
  const linkedFutureEquip   = activeForm ? futureBudgetEquip.filter(i => (activeForm.futureEquipmentIds ?? []).includes(i.id)) : [];
  function futureEqMonthly(item: typeof futureBudgetEquip[0]) { return item.estimatedCost; }
  const equipPerVisit = isMonthlyService
    ? linkedEquip.reduce((s, e) => s + eqMonthlyCost(e), 0) + linkedFutureEquip.reduce((s, i) => s + futureEqMonthly(i), 0)
    : linkedEquip.reduce((s, e) => s + eqMonthlyCost(e) / visitsPerMonth, 0) + linkedFutureEquip.reduce((s, i) => s + futureEqMonthly(i) / visitsPerMonth, 0);
  const basePerVisit     = laborPerVisit + equipPerVisit;
  const maintFeePct      = settingsForm.overheadMarkupPercent ?? 3;
  const consumablesPct   = settingsForm.consumablesPercent ?? 3;
  const maintFeeAmt      = basePerVisit * maintFeePct / 100;
  const consumablesAmt   = basePerVisit * consumablesPct / 100;
  const totalPerVisit    = basePerVisit + maintFeeAmt + consumablesAmt;
  const serviceMarginPct = activeForm?.targetMargin ?? data.settings.targetMargin;
  const targetMargin     = serviceMarginPct / 100;
  const pricePerVisit    = targetMargin < 1 ? totalPerVisit / (1 - targetMargin) : totalPerVisit * 2;
  const currentMargin    = activeForm && activeForm.defaultUnitPrice > 0
    ? ((activeForm.defaultUnitPrice - activeForm.defaultUnitCost) / activeForm.defaultUnitPrice) * 100 : 0;
  const filtered = filterCat === 'all' ? data.serviceCatalog : data.serviceCatalog.filter(s => s.category === filterCat);

  return (
    <div className="flex gap-4" style={{ minHeight: 600 }}>
      <div className="w-56 shrink-0 flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          {(['all', ...CAT_OPTIONS] as const).map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold text-left transition-colors ${filterCat === cat ? 'bg-[#27AE60] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat === 'all' ? 'All Services' : CAT_LABELS[cat]}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 mt-1">
          {filtered.map(item => (
            <button key={item.id} onClick={() => select(item.id)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all ${selectedId === item.id ? 'bg-white border-[#27AE60] shadow-sm' : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-200'}`}>
              <p className={`text-sm font-semibold leading-tight ${selectedId === item.id ? 'text-[#27AE60]' : 'text-gray-800'}`}>{item.name}</p>
              <p className="text-xs text-amber-600 mt-0.5 font-medium">{item.defaultUnitCost > 0 ? `${formatCurrency(item.defaultUnitCost)}/${item.unit}` : 'No cost set'}</p>
            </button>
          ))}
        </div>
        <button onClick={addNew} className="btn-secondary text-xs mt-1">+ Add Service</button>
      </div>

      {activeForm ? (
        <div className="flex-1 space-y-4 overflow-y-auto">
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 mr-4">
                <input className="text-xl font-bold text-gray-900 bg-transparent border-0 border-b-2 border-transparent focus:border-[#27AE60] focus:outline-none w-full pb-1"
                  value={activeForm.name} onChange={e => patch({ name: e.target.value })} />
                <input className="text-sm text-gray-500 bg-transparent border-0 border-b border-transparent focus:border-gray-300 focus:outline-none w-full mt-1"
                  value={activeForm.description} onChange={e => patch({ description: e.target.value })} placeholder="Description..." />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${CAT_COLORS[activeForm.category]}`}>{CAT_LABELS[activeForm.category]}</span>
                <button onClick={() => del(activeForm.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select className="input" value={activeForm.category} onChange={e => patch({ category: e.target.value as ServiceCategory })}>
                  {CAT_OPTIONS.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Unit of Measure</label>
                <select className="input" value={activeForm.unit} onChange={e => patch({ unit: e.target.value })}>
                  <option value="visit">per visit</option>
                  <option value="sq ft">per sq ft</option>
                  <option value="application">per application</option>
                  <option value="event">per event</option>
                  <option value="hour">per hour</option>
                  <option value="bag">per bag</option>
                  <option value="cu yd">per cu yd</option>
                  <option value="each">per each</option>
                  <option value="trip">per trip</option>
                  <option value="month">per month</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Efficiency Rate</h3>
            <div>
              <label className="label">SF per Hour (measured efficiency)</label>
              <input className="input text-lg font-bold" type="number"
                value={sfPerHour > 0 ? Math.round(sfPerHour) : ''}
                onChange={e => { const sf = Number(e.target.value); patch({ estimatedHours: sf > 0 ? parseFloat((1000 / sf).toFixed(6)) : 0 }); }}
                placeholder="e.g. 26983" />
            </div>
          </div>

          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Equipment Used on This Service</h3>
            <p className="text-xs text-gray-400 mb-3">Check which equipment is used. Monthly depreciation cost is added to this service's overhead.</p>
            <div className="space-y-2">
              {data.equipment.map(eq => {
                const checked = activeForm.equipmentIds.includes(eq.id);
                const monthly = eqMonthlyCost(eq);
                return (
                  <label key={eq.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition-all ${checked ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-transparent hover:border-gray-200'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleEquipment(eq.id)} className="accent-[#27AE60] w-4 h-4 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{eq.name}</p>
                      <p className="text-xs text-gray-400">{eq.paymentType === 'monthly_payment' ? 'Payment' : 'Depreciation'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-amber-600">{formatCurrency(monthly)}</p>
                      <p className="text-xs text-gray-400">per month</p>
                    </div>
                  </label>
                );
              })}
              {data.equipment.length === 0 && <p className="text-xs text-gray-400">No equipment — add in the 4-Equipment tab.</p>}
            </div>
          </div>

          {futureBudgetEquip.length > 0 && (
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Future Equipment</h3>
              <p className="text-xs text-gray-400 mb-3">Planned equipment from Growth Planner.</p>
              <div className="space-y-2">
                {futureBudgetEquip.map(item => {
                  const checked = (activeForm?.futureEquipmentIds ?? []).includes(item.id);
                  const monthly = futureEqMonthly(item);
                  return (
                    <label key={item.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition-all ${checked ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-transparent hover:border-gray-200'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleFutureEquipment(item.id)} className="accent-purple-500 w-4 h-4 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{item.category} · {item.status}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-purple-600">{formatCurrency(monthly)}</p>
                        <p className="text-xs text-gray-400">per month</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card bg-gray-900 text-white">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Per-Visit Cost Breakdown</h3>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-400">
                Efficiency: {sfPerHour > 0 ? `${Math.round(sfPerHour).toLocaleString()} SF/hr` : '—'}.
                Crew: <strong className="text-white">{formatCurrency(blendedRate)}/hr</strong>
                {' '}({crewRates.length > 0 ? `${crewRates.length} crew` : `${data.employees.length} employees`} · {data.settings.payrollBurdenPercent ?? 13}% burden)
              </p>
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <span className="text-xs text-gray-400">Visits/mo</span>
                <input type="number" min="1" max="30" className="w-14 bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1 text-center"
                  value={visitsPerMonth} onChange={e => setVisitsPerMonth(Math.max(1, Number(e.target.value)))} />
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <div>
                  <p className="font-medium">Labor</p>
                  <p className="text-xs text-gray-400">{hoursPerVisit > 0 ? `1 hr at ${Math.round(sfPerHour).toLocaleString()} SF/hr × ${formatCurrency(blendedRate)}/hr` : 'Set SF/hr to calculate'}</p>
                </div>
                <p className="text-lg font-bold text-amber-400">{hoursPerVisit > 0 ? formatCurrency(laborPerVisit) : '—'}</p>
              </div>
              {linkedEquip.map(eq => (
                <div key={eq.id} className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <div>
                    <p className="font-medium text-sm">{eq.name}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(eqMonthlyCost(eq))}/mo{isMonthlyService ? ' (monthly)' : ` ÷ ${visitsPerMonth} visits`}</p>
                  </div>
                  <p className="font-semibold text-amber-400">{formatCurrency(isMonthlyService ? eqMonthlyCost(eq) : eqMonthlyCost(eq) / visitsPerMonth)}</p>
                </div>
              ))}
              {linkedFutureEquip.map(item => (
                <div key={item.id} className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <div>
                    <p className="font-medium text-sm text-purple-300">{item.name} <span className="text-[10px] text-purple-400 uppercase">future</span></p>
                    <p className="text-xs text-gray-400">{formatCurrency(futureEqMonthly(item))}/mo{isMonthlyService ? ' (monthly)' : ` ÷ ${visitsPerMonth} visits`}</p>
                  </div>
                  <p className="font-semibold text-purple-400">{formatCurrency(isMonthlyService ? futureEqMonthly(item) : futureEqMonthly(item) / visitsPerMonth)}</p>
                </div>
              ))}
              {linkedEquip.length === 0 && linkedFutureEquip.length === 0 && <p className="text-xs text-gray-500 py-1">No equipment selected above</p>}
              <div className="pt-2 space-y-1.5">
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Maintenance Fee</p>
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" max="50" step="0.5" className="w-14 bg-gray-700 border border-gray-600 text-white text-xs rounded px-1.5 py-0.5 text-center"
                        value={maintFeePct} onChange={e => setSettingsForm(f => ({...f, overheadMarkupPercent: Number(e.target.value)}))} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <p className="font-semibold text-amber-400">{maintFeeAmt > 0 ? formatCurrency(maintFeeAmt) : '—'}</p>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Consumables</p>
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" max="50" step="0.5" className="w-14 bg-gray-700 border border-gray-600 text-white text-xs rounded px-1.5 py-0.5 text-center"
                        value={consumablesPct} onChange={e => setSettingsForm(f => ({...f, consumablesPercent: Number(e.target.value)}))} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <p className="font-semibold text-amber-400">{consumablesAmt > 0 ? formatCurrency(consumablesAmt) : '—'}</p>
                </div>
              </div>
              <div className="pt-3 mt-1 border-t border-white/20 space-y-2">
                <div className="flex justify-between text-base font-bold">
                  <span>Total Cost / Visit</span>
                  <span className="text-amber-300">{totalPerVisit > 0 ? formatCurrency(totalPerVisit) : '—'}</span>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-gray-300 flex-1">Target Margin</span>
                  <input type="number" min="0" max="100" step="1" className="w-16 bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1 text-center"
                    value={serviceMarginPct} onChange={e => patch({ targetMargin: Number(e.target.value) })} />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
              {pricePerVisit > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-[#27AE60]/20 border border-[#27AE60]/40">
                  <p className="text-xs text-green-300 font-semibold mb-2">Suggested Rate at {serviceMarginPct}% Margin</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xl font-bold text-white">{formatCurrency(pricePerVisit)}<span className="text-sm font-normal text-gray-300"> / {isMonthlyService ? 'month' : 'visit'}</span></p>
                      {!isMonthlyService && <p className="text-xs text-gray-300 mt-0.5">{formatCurrency(pricePerVisit * visitsPerMonth)}/mo at {visitsPerMonth} visits</p>}
                    </div>
                    <button onClick={() => patch({ defaultUnitCost: parseFloat(totalPerVisit.toFixed(2)), defaultUnitPrice: parseFloat(pricePerVisit.toFixed(2)), unit: isMonthlyService ? 'month' : 'visit' })}
                      className="text-xs px-3 py-1.5 bg-[#27AE60] hover:bg-green-600 text-white rounded-lg transition-colors">Apply</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(() => {
            const activeContracts = data.contracts.filter(c => c.status === 'active');
            const activeCount = activeContracts.length;
            const totalOverhead = data.overhead.reduce((s, o) => s + o.monthlyCost, 0);
            const isMaint = activeForm?.category === 'maintenance';
            const isLand  = activeForm?.category === 'landscaping';
            if (!isMaint && !isLand) return null;
            const accentColor = isMaint ? 'border-green-400/40 bg-green-900/20' : 'border-blue-400/40 bg-blue-900/20';
            const labelColor  = isMaint ? 'text-green-300' : 'text-blue-300';
            const valueColor  = isMaint ? 'text-green-400' : 'text-blue-400';
            const badgeColor  = isMaint ? 'bg-green-700/40 text-green-200' : 'bg-blue-700/40 text-blue-200';
            const divisor = activeCount > 0 ? activeCount * visitsPerMonth : 0;
            const overheadPerVisit = divisor > 0 ? totalOverhead / divisor : 0;
            return (
              <div className={`card bg-gray-900 text-white border ${accentColor}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-xs font-bold uppercase tracking-widest ${labelColor}`}>Overhead Per Visit</h3>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeColor}`}>{activeCount} Active {activeCount === 1 ? 'Contract' : 'Contracts'}</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-1.5 border-b border-white/10">
                    <div><p className="font-medium">Labor / Visit</p><p className="text-xs text-gray-400">{formatCurrency(blendedRate)}/hr × crew hours</p></div>
                    <p className={`font-semibold ${valueColor}`}>{laborPerVisit > 0 ? formatCurrency(laborPerVisit) : '—'}</p>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-white/10">
                    <div><p className="font-medium">Overhead / Visit</p><p className="text-xs text-gray-400">{formatCurrency(totalOverhead)}/mo ÷ ({activeCount} contracts × {visitsPerMonth} visits)</p></div>
                    <p className={`font-semibold ${valueColor}`}>{divisor > 0 ? formatCurrency(overheadPerVisit) : '—'}</p>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-white/20">
                    <p className="font-bold">Total / Visit</p>
                    <p className={`text-lg font-bold ${valueColor}`}>{divisor > 0 ? formatCurrency(laborPerVisit + overheadPerVisit) : '—'}</p>
                  </div>
                </div>
                {activeCount === 0 && <p className="text-xs text-gray-500 mt-2 italic">No active contracts — activate a contract to calculate overhead spread.</p>}
              </div>
            );
          })()}

          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Catalog Pricing</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Cost / {activeForm.unit || 'unit'} ($)</label>
                <input className="input" type="number" step="0.01" value={activeForm.defaultUnitCost || ''} onChange={e => patch({ defaultUnitCost: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Price / {activeForm.unit || 'unit'} ($)</label>
                <div className="flex gap-2">
                  <input className="input flex-1" type="number" step="0.01" value={activeForm.defaultUnitPrice || ''} onChange={e => patch({ defaultUnitPrice: Number(e.target.value) })} />
                  <button onClick={() => { const m = (activeForm.targetMargin ?? data.settings.targetMargin) / 100; patch({ defaultUnitPrice: parseFloat((m < 1 ? activeForm.defaultUnitCost / (1 - m) : activeForm.defaultUnitCost * 2).toFixed(2)) }); }} className="btn-secondary text-xs px-3">Auto</button>
                </div>
                {activeForm.defaultUnitPrice > 0 && activeForm.defaultUnitCost > 0 && (
                  <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded-full inline-block ${currentMargin >= serviceMarginPct ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {formatPercent(currentMargin)} margin{currentMargin < serviceMarginPct && ` — target ${serviceMarginPct}%`}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pb-4">
            <button className="btn-primary flex-1 py-2.5" onClick={save} disabled={!dirty}>{dirty ? 'Save Changes' : 'Saved ✓'}</button>
            {dirty && <button className="btn-secondary" onClick={() => { setForm(null); setDirty(false); }}>Discard</button>}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400"><p>Select a service from the list</p></div>
      )}
    </div>
  );
}

// ─── 2-MATERIAL TAB ───────────────────────────────────────────────────────────
function MaterialTab({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<FieldSupply | null>(null);
  const blank = (): Omit<FieldSupply,'id'> => ({category:'material', name:'', unit:'bag', unitCost:0, monthlyUsage:0});
  const [form, setForm] = useState(blank());

  function open(item?: FieldSupply) {
    if (item) { setEditing(item); setForm({...item}); }
    else       { setEditing(null); setForm(blank()); }
    setShowModal(true);
  }
  function save() {
    if (!form.name.trim()) { alert('Name required'); return; }
    let updated: AppData;
    if (editing) {
      updated = {...data, fieldSupplies: data.fieldSupplies.map(s => s.id === editing.id ? {...editing, ...form} : s)};
    } else {
      updated = {...data, fieldSupplies: [...data.fieldSupplies, {id:`sp_${Date.now()}`, ...form}]};
    }
    setData(updated); saveData(updated); setShowModal(false);
  }
  function del(id: string) {
    if (!confirm('Delete this item?')) return;
    const updated = {...data, fieldSupplies: data.fieldSupplies.filter(s => s.id !== id)};
    setData(updated); saveData(updated);
  }

  const total = data.fieldSupplies.reduce((s, f) => s + f.unitCost * f.monthlyUsage, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Est. monthly materials &amp; supplies: <span className="font-semibold text-gray-800">{formatCurrency(total)}/mo</span></p>
        <button className="btn-primary text-sm" onClick={() => open()}>+ Add Item</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Item','Category','Unit','Cost/Unit','Monthly Usage','Monthly Cost',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.fieldSupplies.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No materials yet — add fuel, de-icing salt, seed, mulch, etc.</td></tr>
            )}
            {data.fieldSupplies.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{item.category}</td>
                <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                <td className="px-4 py-3 text-gray-700">{formatCurrency(item.unitCost)}</td>
                <td className="px-4 py-3 text-gray-600">{item.monthlyUsage}</td>
                <td className="px-4 py-3 font-semibold text-gray-800">{formatCurrency(item.unitCost * item.monthlyUsage)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(item)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => del(item.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Item' : 'Add Material / Supply'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. De-icing Salt, Premium Gas" /></div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value as FieldSupply['category']})}>
                  {(['fuel','material','equipment','gear'] as const).map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div><label className="label">Unit</label><input className="input" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} placeholder="bag, gallon, lb" /></div>
              <div><label className="label">Cost / Unit ($)</label><input className="input" type="number" value={form.unitCost || ''} onChange={e => setForm({...form, unitCost: Number(e.target.value)})} /></div>
              <div><label className="label">Monthly Usage</label><input className="input" type="number" value={form.monthlyUsage || ''} onChange={e => setForm({...form, monthlyUsage: Number(e.target.value)})} /></div>
            </div>
            {form.unitCost > 0 && form.monthlyUsage > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">Monthly cost: <strong>{formatCurrency(form.unitCost * form.monthlyUsage)}</strong></div>
            )}
            <div className="flex gap-3"><button className="btn-primary flex-1" onClick={save}>Save</button><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 3-SUBCONTRACTORS TAB ─────────────────────────────────────────────────────
function SubcontractorsTab({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Subcontractor | null>(null);
  const blank = (): Omit<Subcontractor,'id'> => ({ companyName:'', contactName:'', phone:'', email:'', specialty:'', rateType:'hourly', rate:0, notes:'' });
  const [form, setForm] = useState(blank());

  function open(sub?: Subcontractor) {
    if (sub) { setEditing(sub); setForm({...sub}); }
    else      { setEditing(null); setForm(blank()); }
    setShowModal(true);
  }
  function save() {
    if (!form.companyName.trim()) { alert('Company name required'); return; }
    let updated: AppData;
    if (editing) {
      updated = {...data, subcontractors: data.subcontractors.map(s => s.id === editing.id ? {...editing, ...form} : s)};
    } else {
      updated = {...data, subcontractors: [...(data.subcontractors ?? []), {id:`sub_${Date.now()}`, ...form}]};
    }
    setData(updated); saveData(updated); setShowModal(false);
  }
  function del(id: string) {
    if (!confirm('Delete this subcontractor?')) return;
    const updated = {...data, subcontractors: data.subcontractors.filter(s => s.id !== id)};
    setData(updated); saveData(updated);
  }

  const subs = data.subcontractors ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500"><span className="font-semibold text-gray-800">{subs.length}</span> subcontractor{subs.length !== 1 ? 's' : ''} on file</p>
        <button className="btn-primary text-sm" onClick={() => open()}>+ Add Subcontractor</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Company','Contact','Specialty','Rate','Phone / Email',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {subs.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No subcontractors yet — add tree services, irrigation companies, concrete, etc.</td></tr>
            )}
            {subs.map(sub => (
              <tr key={sub.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{sub.companyName}</td>
                <td className="px-4 py-3 text-gray-600">{sub.contactName || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{sub.specialty || '—'}</td>
                <td className="px-4 py-3 font-semibold text-amber-600">
                  {sub.rate > 0 ? `${formatCurrency(sub.rate)}/${sub.rateType === 'hourly' ? 'hr' : sub.rateType === 'daily' ? 'day' : 'project'}` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {sub.phone && <div>{sub.phone}</div>}
                  {sub.email && <div>{sub.email}</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(sub)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => del(sub.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? `Edit ${editing.companyName}` : 'Add Subcontractor'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Company Name *</label><input className="input" value={form.companyName} onChange={e => setForm({...form, companyName: e.target.value})} placeholder="e.g. Johnson Tree Service" /></div>
              <div><label className="label">Contact Name</label><input className="input" value={form.contactName} onChange={e => setForm({...form, contactName: e.target.value})} /></div>
              <div><label className="label">Specialty</label><input className="input" value={form.specialty} onChange={e => setForm({...form, specialty: e.target.value})} placeholder="e.g. Tree Removal, Irrigation" /></div>
              <div><label className="label">Phone</label><input className="input" type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div>
                <label className="label">Rate Type</label>
                <select className="input" value={form.rateType} onChange={e => setForm({...form, rateType: e.target.value as Subcontractor['rateType']})}>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="project">Per Project</option>
                </select>
              </div>
              <div><label className="label">Rate ($)</label><input className="input" type="number" value={form.rate || ''} onChange={e => setForm({...form, rate: Number(e.target.value)})} /></div>
              <div className="col-span-2"><label className="label">Notes</label><textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>
            <div className="flex gap-3"><button className="btn-primary flex-1" onClick={save}>Save</button><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 4-EQUIPMENT TAB ──────────────────────────────────────────────────────────
function EquipmentTab({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Equipment | null>(null);
  const blank = (): Omit<Equipment,'id'> => ({ name:'', purchaseDate:'', purchaseCost:0, usefulLifeYears:5, monthlyDepreciation:0, monthlyMaintenancePct:5, paymentType:'paid_in_full', monthlyPaymentAmount:0, seasons:['spring','summer','fall'], notes:'' });
  const [form, setForm] = useState(blank());

  function open(eq?: Equipment) {
    if (eq) { setEditing(eq); setForm({...eq}); }
    else     { setEditing(null); setForm(blank()); }
    setShowModal(true);
  }
  function calcMonthlyTotal(cost: number, months: number, maintenancePct: number): number {
    return parseFloat(((cost / months) + (cost * (maintenancePct / 100) / 12)).toFixed(2));
  }
  function autoDepreciation() {
    const months = Math.round(form.usefulLifeYears * 12) || 12;
    setForm(f => ({...f, monthlyDepreciation: calcMonthlyTotal(f.purchaseCost, months, f.monthlyMaintenancePct)}));
  }
  function eqLongevityMonths(): number {
    const m = Math.round(form.usefulLifeYears * 12);
    return [3,6,12,36,60,120].includes(m) ? m : 12;
  }
  function setLongevity(months: number) {
    setForm(f => ({...f, usefulLifeYears: months / 12, monthlyDepreciation: f.purchaseCost > 0 ? calcMonthlyTotal(f.purchaseCost, months, f.monthlyMaintenancePct) : f.monthlyDepreciation}));
  }
  function save() {
    if (!form.name.trim()) { alert('Name required'); return; }
    let updated: AppData;
    if (editing) {
      updated = {...data, equipment: data.equipment.map(e => e.id === editing.id ? {...editing, ...form} : e)};
    } else {
      updated = {...data, equipment: [...data.equipment, {id:`eq_${Date.now()}`, ...form}]};
    }
    setData(updated); saveData(updated); setShowModal(false);
  }
  function del(id: string) {
    if (!confirm('Delete this equipment?')) return;
    const updated = {...data, equipment: data.equipment.filter(e => e.id !== id)};
    setData(updated); saveData(updated);
  }

  const totalDeprec = data.equipment.reduce((s, e) => s + eqMonthlyCost(e), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Total monthly depreciation: <span className="font-semibold text-gray-800">{formatCurrency(totalDeprec)}</span></p>
        <button className="btn-primary text-sm" onClick={() => open()}>+ Add Equipment</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Name','Purchased','Cost','Monthly Total','Maint %','Seasons',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.equipment.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No equipment yet.</td></tr>
            )}
            {data.equipment.map(eq => (
              <tr key={eq.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{eq.name}</td>
                <td className="px-4 py-3 text-gray-500">{eq.purchaseDate}</td>
                <td className="px-4 py-3 text-gray-600">{formatCurrency(eq.purchaseCost)}</td>
                <td className="px-4 py-3 text-yellow-600 font-medium">
                  {formatCurrency(eqMonthlyCost(eq))}
                  {eq.paymentType === 'monthly_payment' && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">Loan</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{eq.monthlyMaintenancePct ?? 5}%</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{eq.seasons.join(', ')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(eq)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => del(eq.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? `Edit ${editing.name}` : 'Add Equipment'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Payment Status</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button type="button" onClick={() => setForm({...form, paymentType: 'paid_in_full'})}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${form.paymentType === 'paid_in_full' ? 'bg-[#27AE60] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Paid in Full
                </button>
                <button type="button" onClick={() => setForm({...form, paymentType: 'monthly_payment'})}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors border-l border-gray-300 ${form.paymentType === 'monthly_payment' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Monthly Payment
                </button>
              </div>
              {form.paymentType === 'monthly_payment' && (
                <div className="mt-2">
                  <label className="label">Monthly Payment Amount ($)</label>
                  <input className="input" type="number" step="0.01" value={form.monthlyPaymentAmount || ''} onChange={e => setForm({...form, monthlyPaymentAmount: Number(e.target.value)})} placeholder="e.g. 450.00" />
                  <p className="text-xs text-blue-600 mt-1">This payment is used for monthly equipment total.</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><label className="label">Purchase Date</label><input className="input" type="date" value={form.purchaseDate} onChange={e => setForm({...form, purchaseDate: e.target.value})} /></div>
              <div><label className="label">Purchase Cost ($)</label><input className="input" type="number" value={form.purchaseCost || ''} onChange={e => setForm({...form, purchaseCost: Number(e.target.value)})} /></div>
              <div>
                <label className="label">Equipment Longevity</label>
                <select className="input" value={eqLongevityMonths()} onChange={e => setLongevity(Number(e.target.value))}>
                  {LONGEVITY_OPTIONS.map(o => <option key={o.months} value={o.months}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Maintenance Reserve (%/yr)</label>
                <input className="input" type="number" min="0" max="100" step="1" value={form.monthlyMaintenancePct} onChange={e => setForm({...form, monthlyMaintenancePct: Number(e.target.value)})} />
              </div>
              <div>
                <label className="label">Monthly Total ($)</label>
                <div className="flex gap-2">
                  <input className="input" type="number" value={form.monthlyDepreciation || ''} onChange={e => setForm({...form, monthlyDepreciation: Number(e.target.value)})} />
                  <button type="button" className="btn-secondary text-xs px-2" onClick={autoDepreciation}>Auto</button>
                </div>
                {form.purchaseCost > 0 && eqLongevityMonths() > 0 && (
                  <p className="text-xs text-gray-400 mt-1">Deprec {formatCurrency(form.purchaseCost / eqLongevityMonths())} + Maint {formatCurrency(form.purchaseCost * form.monthlyMaintenancePct / 100 / 12)}/mo</p>
                )}
              </div>
            </div>
            <div>
              <label className="label">Active Seasons</label>
              <div className="flex gap-3 flex-wrap">
                {SEASON_OPTIONS.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer capitalize">
                    <input type="checkbox" checked={form.seasons.includes(s)} onChange={() => setForm(f => ({...f, seasons: f.seasons.includes(s) ? f.seasons.filter(x => x !== s) : [...f.seasons, s]}))} className="accent-[#27AE60]" />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            <div className="flex gap-3"><button className="btn-primary flex-1" onClick={save}>Save</button><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 5-OTHER/OVERHEAD TAB ─────────────────────────────────────────────────────
const OH_CATEGORIES: OverheadCategory[] = ['software','insurance','license','office','other'];
const OH_LABELS: Record<OverheadCategory, string> = { software:'Software', insurance:'Insurance', license:'License', office:'Office', other:'Other' };

function OtherOverheadTab({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<OverheadItem | null>(null);
  const blank = (): Omit<OverheadItem,'id'> => ({category:'software', name:'', monthlyCost:0, notes:''});
  const [form, setForm] = useState(blank());

  function open(item?: OverheadItem) {
    if (item) { setEditing(item); setForm({...item}); }
    else       { setEditing(null); setForm(blank()); }
    setShowModal(true);
  }
  function save() {
    if (!form.name.trim()) { alert('Name required'); return; }
    let updated: AppData;
    if (editing) {
      updated = {...data, overhead: data.overhead.map(o => o.id === editing.id ? {...editing, ...form} : o)};
    } else {
      updated = {...data, overhead: [...data.overhead, {id:`oh_${Date.now()}`, ...form}]};
    }
    setData(updated); saveData(updated); setShowModal(false);
  }
  function del(id: string) {
    if (!confirm('Delete this item?')) return;
    const updated = {...data, overhead: data.overhead.filter(o => o.id !== id)};
    setData(updated); saveData(updated);
  }

  const total = data.overhead.reduce((s, o) => s + o.monthlyCost, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Total fixed overhead: <span className="font-semibold text-gray-800">{formatCurrency(total)}/mo</span></p>
        <button className="btn-primary text-sm" onClick={() => open()}>+ Add Item</button>
      </div>

      {OH_CATEGORIES.map(cat => {
        const items = data.overhead.filter(o => o.category === cat);
        if (items.length === 0) return null;
        const catTotal = items.reduce((s, o) => s + o.monthlyCost, 0);
        return (
          <div key={cat}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wide">{OH_LABELS[cat]}</h3>
              <span className="text-xs font-semibold text-gray-600">{formatCurrency(catTotal)}/mo</span>
            </div>
            <div className="card p-0 overflow-hidden mb-2">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-800">{item.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{item.notes}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800 text-right">{formatCurrency(item.monthlyCost)}/mo</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2 justify-end">
                          <button className="text-xs text-[#27AE60] hover:underline" onClick={() => open(item)}>Edit</button>
                          <button className="text-xs text-red-500 hover:underline" onClick={() => del(item.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {data.overhead.length === 0 && <div className="card text-center py-8 text-gray-400 text-sm">No overhead items yet — add software subscriptions, insurance, licenses, etc.</div>}

      {showModal && (
        <Modal title={editing ? 'Edit Item' : 'Add Overhead Item'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value as OverheadCategory})}>
                {OH_CATEGORIES.map(c => <option key={c} value={c}>{OH_LABELS[c]}</option>)}
              </select>
            </div>
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><label className="label">Monthly Cost ($)</label><input className="input" type="number" value={form.monthlyCost || ''} onChange={e => setForm({...form, monthlyCost: Number(e.target.value)})} /></div>
            <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            <div className="flex gap-3"><button className="btn-primary flex-1" onClick={save}>Save</button><button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── EFFICIENCIES TAB ─────────────────────────────────────────────────────────
function EfficienciesTab({ data, setData }: Props) {
  const [form, setForm] = useState({...data.settings});
  const [taxRates, setTaxRates] = useState<SalesTaxRate[]>(data.salesTaxRates ?? []);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [editingTax, setEditingTax] = useState<SalesTaxRate | null>(null);
  const blankTax = (): Omit<SalesTaxRate,'id'> => ({ name: '', state: 'MN', county: '', activity: 'Landscaping Services', rate: 0 });
  const [taxForm, setTaxForm] = useState(blankTax());

  function save() {
    const updated = {...data, settings: form, salesTaxRates: taxRates};
    setData(updated); saveData(updated);
    alert('Settings saved!');
  }
  function saveTaxRate() {
    const newRates = editingTax
      ? taxRates.map(r => r.id === editingTax.id ? { ...editingTax, ...taxForm } : r)
      : [...taxRates, { id: `tax_${Date.now()}`, ...taxForm }];
    setTaxRates(newRates);
    const updated = { ...data, settings: form, salesTaxRates: newRates };
    setData(updated); saveData(updated); setShowTaxModal(false);
  }
  function deleteTaxRate(id: string) {
    const newRates = taxRates.filter(r => r.id !== id);
    setTaxRates(newRates);
    const updated = { ...data, salesTaxRates: newRates };
    setData(updated); saveData(updated);
  }

  type SnowTier = {
    label: string;
    badge: string;
    eventsKey: keyof typeof form;
    plowHrsKey: keyof typeof form;
    plowSFKey: keyof typeof form;
    shovelHrsKey: keyof typeof form;
    shovelSFKey: keyof typeof form;
  };
  const snowTiers: SnowTier[] = [
    { label: '4" or More', badge: 'bg-blue-100 text-blue-700', eventsKey: 'snowEvents4in', plowHrsKey: 'snowPlow4inHrs', plowSFKey: 'snowPlow4inSF', shovelHrsKey: 'snowShovel4inHrs', shovelSFKey: 'snowShovel4inSF' },
    { label: '1.5" or More', badge: 'bg-sky-100 text-sky-700', eventsKey: 'snowEvents1_5in', plowHrsKey: 'snowPlow1_5inHrs', plowSFKey: 'snowPlow1_5inSF', shovelHrsKey: 'snowShovel1_5inHrs', shovelSFKey: 'snowShovel1_5inSF' },
    { label: 'Dusting (<1.5")', badge: 'bg-gray-100 text-gray-600', eventsKey: 'snowEventsDusting', plowHrsKey: 'snowPlowDustingHrs', plowSFKey: 'snowPlowDustingSF', shovelHrsKey: 'snowShovelDustingHrs', shovelSFKey: 'snowShovelDustingSF' },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Snow Efficiency Tiers ── */}
      <div className="card space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">❄ Snow Efficiency Benchmarks</h3>
          <p className="text-xs text-gray-400 mt-0.5">Reference efficiency tiers used for estimating. Edit hours and SF benchmarks per event type.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {snowTiers.map(tier => (
            <div key={tier.label} className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-800">{tier.label}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${tier.badge}`}>Snow</span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Events / Season</label>
                <input className="input mt-1 text-center font-bold" type="number" min="0"
                  value={(form[tier.eventsKey] as number) ?? 0}
                  onChange={e => setForm(f => ({...f, [tier.eventsKey]: Number(e.target.value)}))} />
              </div>

              <div className="border-t border-gray-200 pt-3 space-y-2">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Plowing</p>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <label className="text-[10px] text-gray-400">Hours</label>
                    <input className="input text-xs py-1 text-center" type="number" step="0.5" min="0"
                      value={(form[tier.plowHrsKey] as number) ?? 0}
                      onChange={e => setForm(f => ({...f, [tier.plowHrsKey]: Number(e.target.value)}))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">SF</label>
                    <input className="input text-xs py-1 text-center" type="number" step="1000" min="0"
                      value={(form[tier.plowSFKey] as number) ?? 0}
                      onChange={e => setForm(f => ({...f, [tier.plowSFKey]: Number(e.target.value)}))} />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">
                  {(form[tier.plowHrsKey] as number) > 0 && (form[tier.plowSFKey] as number) > 0
                    ? `= ${Math.round((form[tier.plowSFKey] as number) / (form[tier.plowHrsKey] as number)).toLocaleString()} SF/hr`
                    : '—'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Shoveling</p>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <label className="text-[10px] text-gray-400">Hours</label>
                    <input className="input text-xs py-1 text-center" type="number" step="0.5" min="0"
                      value={(form[tier.shovelHrsKey] as number) ?? 0}
                      onChange={e => setForm(f => ({...f, [tier.shovelHrsKey]: Number(e.target.value)}))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">SF</label>
                    <input className="input text-xs py-1 text-center" type="number" step="1000" min="0"
                      value={(form[tier.shovelSFKey] as number) ?? 0}
                      onChange={e => setForm(f => ({...f, [tier.shovelSFKey]: Number(e.target.value)}))} />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">
                  {(form[tier.shovelHrsKey] as number) > 0 && (form[tier.shovelSFKey] as number) > 0
                    ? `= ${Math.round((form[tier.shovelSFKey] as number) / (form[tier.shovelHrsKey] as number)).toLocaleString()} SF/hr`
                    : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Shop / Home Base ── */}
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Shop / Home Base</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Shop Name</label><input className="input" type="text" value={form.shopName ?? ''} onChange={e => setForm({...form, shopName: e.target.value})} /></div>
          <div><label className="label">Average Drive Speed (mph)</label><input className="input" type="number" value={form.averageSpeedMph ?? 30} onChange={e => setForm({...form, averageSpeedMph: Number(e.target.value)})} /></div>
          <div><label className="label">Fuel Cost ($/gal)</label><input className="input" type="number" step="0.01" value={form.fuelCostPerGallon ?? 3.50} onChange={e => setForm({...form, fuelCostPerGallon: Number(e.target.value)})} /></div>
          <div><label className="label">Vehicle MPG</label><input className="input" type="number" step="0.5" value={form.vehicleMpg ?? 12} onChange={e => setForm({...form, vehicleMpg: Number(e.target.value)})} /></div>
          <div className="col-span-2"><label className="label">Shop Address</label><input className="input" type="text" value={form.shopAddress ?? ''} onChange={e => setForm({...form, shopAddress: e.target.value})} placeholder="123 Main St, Minneapolis, MN" /><p className="text-xs text-gray-400 mt-1">Starting point for drive time on Schedule</p></div>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide pt-2 border-t">Labor &amp; Margins</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Target Profit Margin (%)</label><input className="input" type="number" value={form.targetMargin} onChange={e => setForm({...form, targetMargin: Number(e.target.value)})} /></div>
          <div><label className="label">Payroll Burden (%)</label><input className="input" type="number" value={form.payrollBurdenPercent ?? 13} onChange={e => setForm({...form, payrollBurdenPercent: Number(e.target.value)})} /><p className="text-xs text-gray-400 mt-1">FICA ~7.65% + workers comp + FUTA/SUTA</p></div>
          <div><label className="label">Default Labor Rate ($/hr)</label><input className="input" type="number" value={form.laborRatePerHour} onChange={e => setForm({...form, laborRatePerHour: Number(e.target.value)})} /></div>
          <div><label className="label">Working Days / Month</label><input className="input" type="number" value={form.defaultWorkingDaysPerMonth} onChange={e => setForm({...form, defaultWorkingDaysPerMonth: Number(e.target.value)})} /></div>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide pt-2 border-t">Snow Removal Rates</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Plowing Rate ($/hr) — client</label><input className="input" type="number" value={form.plowingRatePerHour} onChange={e => setForm({...form, plowingRatePerHour: Number(e.target.value)})} /></div>
          <div><label className="label">Plowing Cost ($/hr) — internal</label><input className="input" type="number" value={form.plowingCostPerHour} onChange={e => setForm({...form, plowingCostPerHour: Number(e.target.value)})} /></div>
          <div><label className="label">Shoveling Rate ($/hr) — client</label><input className="input" type="number" value={form.shovelingRatePerHour} onChange={e => setForm({...form, shovelingRatePerHour: Number(e.target.value)})} /></div>
          <div><label className="label">Shoveling Cost ($/hr) — internal</label><input className="input" type="number" value={form.shovelingCostPerHour} onChange={e => setForm({...form, shovelingCostPerHour: Number(e.target.value)})} /></div>
          <div><label className="label">De-icing Rate ($/bag) — client</label><input className="input" type="number" value={form.deicingRatePerBag} onChange={e => setForm({...form, deicingRatePerBag: Number(e.target.value)})} /></div>
          <div><label className="label">De-icing Cost ($/bag) — internal</label><input className="input" type="number" value={form.deicingCostPerBag} onChange={e => setForm({...form, deicingCostPerBag: Number(e.target.value)})} /></div>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide pt-2 border-t">Estimate Markups</h3>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="label">Consumables (%)</label><input className="input" type="number" step="0.5" value={form.consumablesPercent ?? 3} onChange={e => setForm({...form, consumablesPercent: Number(e.target.value)})} /><p className="text-xs text-gray-400 mt-1">Applied to all estimate costs</p></div>
          <div><label className="label">Overhead Markup (%)</label><input className="input" type="number" step="0.5" value={form.overheadMarkupPercent ?? 3} onChange={e => setForm({...form, overheadMarkupPercent: Number(e.target.value)})} /><p className="text-xs text-gray-400 mt-1">Applied after consumables</p></div>
          <div><label className="label">Target Profit Margin (%)</label><input className="input" type="number" step="1" value={form.targetMargin} onChange={e => setForm({...form, targetMargin: Number(e.target.value)})} /><p className="text-xs text-gray-400 mt-1">Gross margin goal</p></div>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide pt-2 border-t">Sales Tax Rates</h3>
        <p className="text-xs text-gray-400 -mt-2">Configure rates by county, state, and service type. Select on each quote to apply automatically.</p>
        {taxRates.length > 0 && (
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1.5 text-xs text-gray-500 font-semibold">Name</th>
                <th className="text-left py-1.5 text-xs text-gray-500 font-semibold">State</th>
                <th className="text-left py-1.5 text-xs text-gray-500 font-semibold">County</th>
                <th className="text-left py-1.5 text-xs text-gray-500 font-semibold">Activity</th>
                <th className="text-right py-1.5 text-xs text-gray-500 font-semibold">Rate</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {taxRates.map(r => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2 text-gray-600">{r.state}</td>
                  <td className="py-2 text-gray-600">{r.county}</td>
                  <td className="py-2 text-gray-500 text-xs">{r.activity}</td>
                  <td className="py-2 text-right font-semibold text-gray-800">{r.rate}%</td>
                  <td className="py-2 text-right">
                    <button onClick={() => { setEditingTax(r); setTaxForm({...r}); setShowTaxModal(true); }} className="text-xs text-blue-500 hover:underline mr-2">Edit</button>
                    <button onClick={() => deleteTaxRate(r.id)} className="text-xs text-red-400 hover:underline">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {taxRates.length === 0 && <p className="text-xs text-gray-400 italic">No tax rates configured yet.</p>}
        <button className="btn-secondary text-sm py-1.5 px-3" onClick={() => { setEditingTax(null); setTaxForm(blankTax()); setShowTaxModal(true); }}>+ Add Tax Rate</button>

        <button className="btn-primary" onClick={save}>Save Settings</button>
      </div>

      {showTaxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingTax ? 'Edit Tax Rate' : 'New Tax Rate'}</h2>
              <button onClick={() => setShowTaxModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="label">Rate Name</label><input className="input" value={taxForm.name} onChange={e => setTaxForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Hennepin County - Landscaping" autoFocus /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">State</label><input className="input" value={taxForm.state} onChange={e => setTaxForm(f => ({...f, state: e.target.value}))} maxLength={2} placeholder="MN" /></div>
                <div><label className="label">Rate (%)</label><input className="input" type="number" min="0" step="0.001" value={taxForm.rate || ''} onChange={e => setTaxForm(f => ({...f, rate: Number(e.target.value)}))} placeholder="7.525" /></div>
                <div><label className="label">County</label><input className="input" value={taxForm.county} onChange={e => setTaxForm(f => ({...f, county: e.target.value}))} placeholder="Hennepin" /></div>
                <div><label className="label">Activity / Service Type</label><input className="input" value={taxForm.activity} onChange={e => setTaxForm(f => ({...f, activity: e.target.value}))} placeholder="Landscaping Services" /></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={saveTaxRate} className="btn-primary flex-1">Save</button>
              <button onClick={() => setShowTaxModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CONTRACTS TAB ────────────────────────────────────────────────────────────
const TMPL_TYPES: ContractTemplateType[] = ['maintenance','landscaping','snow'];
const TMPL_LABELS: Record<ContractTemplateType, string> = { maintenance:'Maintenance Agreement', landscaping:'Landscaping Project', snow:'Snow Removal' };
const TMPL_COLORS: Record<ContractTemplateType, string> = { maintenance:'bg-green-100 text-green-700', landscaping:'bg-blue-100 text-blue-700', snow:'bg-sky-100 text-sky-700' };

function ContractsTab({ data, setData }: Props) {
  const [selected, setSelected] = useState<string>(data.contractTemplates[0]?.id ?? '');
  const [editing, setEditing]   = useState(false);
  const [content, setContent]   = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm]   = useState({ name:'', type:'maintenance' as ContractTemplateType });

  const tmpl = data.contractTemplates.find(t => t.id === selected) ?? null;

  function startEdit() { setContent(tmpl?.content ?? ''); setEditing(true); }
  function saveEdit() {
    const updated = { ...data, contractTemplates: data.contractTemplates.map(t => t.id === selected ? {...t, content, updatedAt: new Date().toISOString().slice(0,10)} : t) };
    setData(updated); saveData(updated); setEditing(false);
  }
  function addTemplate() {
    if (!newForm.name.trim()) { alert('Name required'); return; }
    const newTmpl: ContractTemplate = { id:`tmpl_${Date.now()}`, name:newForm.name, type:newForm.type, content:`${newForm.name.toUpperCase()}\n\nAdd your contract language here.\n\nGreenSun Landscapes LLC`, updatedAt:new Date().toISOString().slice(0,10) };
    const updated = {...data, contractTemplates: [...data.contractTemplates, newTmpl]};
    setData(updated); saveData(updated); setSelected(newTmpl.id); setShowNewModal(false);
  }
  function delTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    const updated = {...data, contractTemplates: data.contractTemplates.filter(t => t.id !== id)};
    setData(updated); saveData(updated); setSelected(updated.contractTemplates[0]?.id ?? '');
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      <div className="w-52 shrink-0 space-y-1">
        {TMPL_TYPES.map(type => {
          const items = data.contractTemplates.filter(t => t.type === type);
          if (items.length === 0) return null;
          return (
            <div key={type} className="mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 px-1">{TMPL_LABELS[type]}</p>
              {items.map(t => (
                <button key={t.id} onClick={() => { setSelected(t.id); setEditing(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selected === t.id ? 'bg-[#27AE60] text-white font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          );
        })}
        <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#27AE60] hover:bg-green-50 font-semibold border-2 border-dashed border-green-200 mt-2" onClick={() => setShowNewModal(true)}>
          + New Template
        </button>
      </div>
      <div className="flex-1 flex flex-col">
        {tmpl ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${TMPL_COLORS[tmpl.type]}`}>{tmpl.type}</span>
                <h3 className="font-semibold text-gray-800">{tmpl.name}</h3>
                <span className="text-xs text-gray-400">Updated {tmpl.updatedAt}</span>
              </div>
              <div className="flex gap-2">
                {!editing && <button className="btn-secondary text-sm" onClick={startEdit}>Edit</button>}
                {editing && <><button className="btn-primary text-sm" onClick={saveEdit}>Save</button><button className="btn-secondary text-sm" onClick={() => setEditing(false)}>Cancel</button></>}
                <button className="text-xs text-red-500 hover:underline" onClick={() => delTemplate(tmpl.id)}>Delete</button>
              </div>
            </div>
            {editing ? (
              <textarea className="flex-1 w-full border border-gray-300 rounded-xl p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#27AE60] resize-none" value={content} onChange={e => setContent(e.target.value)} rows={24} />
            ) : (
              <div className="flex-1 card p-5 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{tmpl.content}</pre>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 card flex items-center justify-center text-gray-400"><p>Select a template to view or edit</p></div>
        )}
      </div>
      {showNewModal && (
        <Modal title="New Contract Template" onClose={() => setShowNewModal(false)}>
          <div className="space-y-4">
            <div><label className="label">Template Name</label><input className="input" value={newForm.name} onChange={e => setNewForm({...newForm, name: e.target.value})} placeholder="e.g. Commercial Maintenance Agreement" /></div>
            <div><label className="label">Type</label><select className="input" value={newForm.type} onChange={e => setNewForm({...newForm, type: e.target.value as ContractTemplateType})}>{TMPL_TYPES.map(t => <option key={t} value={t}>{TMPL_LABELS[t]}</option>)}</select></div>
            <div className="flex gap-3"><button className="btn-primary flex-1" onClick={addTemplate}>Create</button><button className="btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MAIN RESOURCES PAGE ──────────────────────────────────────────────────────
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview',       label: 'Overview'         },
  { key: 'rates',          label: 'Rates'            },
  { key: 'labor',          label: '1-Labor'          },
  { key: 'material',       label: '2-Material'       },
  { key: 'subcontractors', label: '3-Subcontractors' },
  { key: 'equipment',      label: '4-Equipment'      },
  { key: 'overhead',       label: '5-Other/Overhead' },
  { key: 'efficiencies',   label: 'Efficiencies'     },
  { key: 'contracts',      label: 'Contracts'        },
];

export default function Resources({ data, setData }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Resources" subtitle="Manage your business costs, service rates, and contract templates" />

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'       && <OverviewTab       data={data} />}
      {tab === 'rates'          && <RatesTab          data={data} setData={setData} />}
      {tab === 'labor'          && <LaborTab          data={data} setData={setData} />}
      {tab === 'material'       && <MaterialTab       data={data} setData={setData} />}
      {tab === 'subcontractors' && <SubcontractorsTab data={data} setData={setData} />}
      {tab === 'equipment'      && <EquipmentTab      data={data} setData={setData} />}
      {tab === 'overhead'       && <OtherOverheadTab  data={data} setData={setData} />}
      {tab === 'efficiencies'   && <EfficienciesTab   data={data} setData={setData} />}
      {tab === 'contracts'      && <ContractsTab      data={data} setData={setData} />}
    </div>
  );
}
