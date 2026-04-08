import { useState } from 'react';
import type { AppData, FutureBudgetItem, BudgetCategory, BudgetPriority, BudgetStatus, Equipment } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency, calcMonthlyLaborCost } from '../utils/calculations';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const LONGEVITY_OPTIONS = [
  { months: 3,   label: '3 months' },
  { months: 6,   label: '6 months' },
  { months: 12,  label: '1 year'   },
  { months: 36,  label: '3 years'  },
  { months: 60,  label: '5 years'  },
  { months: 120, label: '10 years' },
];

function calcEqMonthly(purchaseCost: number, usefulLifeMonths: number, maintenancePct: number): number {
  if (usefulLifeMonths <= 0) return 0;
  return parseFloat((purchaseCost / usefulLifeMonths + purchaseCost * maintenancePct / 100 / 12).toFixed(2));
}

interface Props { data: AppData; setData: (d: AppData) => void }

// ─── Category definitions ─────────────────────────────────────────────────────
interface CatDef {
  key: BudgetCategory;
  label: string;
  icon: string;
  tagline: string;
  smartForm: SmartFormDef;
}

interface SmartFormDef {
  title: string;
  typeOptions?: string[];
  typeLabel?: string;
  fields: SmartField[];
  costMode: 'direct' | 'computed';   // computed = calculate from sub-fields
}

interface SmartField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'month';
  placeholder?: string;
  options?: string[];
}

const CATEGORIES: CatDef[] = [
  {
    key: 'marketing', label: 'Marketing', icon: '📣',
    tagline: 'Get your name out there',
    smartForm: {
      title: 'Add Marketing Investment',
      costMode: 'direct',
      fields: [
        { key: 'type',   label: 'Marketing Type',  type: 'select', options: ['Google Ads','Facebook / Instagram Ads','Truck Wrap','Yard Signs','Door Hangers / Flyers','Website Upgrade','Print Mailer','Sponsorship','Branded Gear / Uniforms','Other'] },
        { key: 'detail', label: 'Description',      type: 'text',   placeholder: 'e.g. Monthly Google Local Services Ads' },
        { key: 'cost',   label: 'Estimated Cost ($)', type: 'number', placeholder: '0' },
        { key: 'notes',  label: 'Goal / Why',       type: 'text',   placeholder: 'What do you expect this to bring in?' },
      ],
    },
  },
  {
    key: 'equipment', label: 'Equipment', icon: '🚜',
    tagline: 'Tools to handle more jobs',
    smartForm: {
      title: 'Add Equipment',
      costMode: 'direct',
      fields: [
        { key: 'type',   label: 'Equipment Type',  type: 'select', options: ['Zero-Turn Mower','Commercial Walk-Behind Mower','Push Mower','Weed Whip / Trimmer','Backpack Blower','Enclosed Trailer','Open Trailer','Snowblower','Plow Attachment','Salt Spreader','Sprayer','Aerator','Power Rake','Other'] },
        { key: 'detail', label: 'Brand / Model',   type: 'text',   placeholder: 'e.g. Hustler Super Z 60"' },
        { key: 'cost',   label: 'Estimated Cost ($)', type: 'number', placeholder: '0' },
        { key: 'notes',  label: 'Notes',            type: 'text',   placeholder: 'New or used? Where are you buying from?' },
      ],
    },
  },
  {
    key: 'vehicle', label: 'Vehicle', icon: '🚛',
    tagline: 'Expand your fleet',
    smartForm: {
      title: 'Add Vehicle',
      costMode: 'direct',
      fields: [
        { key: 'type',   label: 'Vehicle Type',    type: 'select', options: ['Pickup Truck (1/2 ton)','Pickup Truck (3/4 ton)','Pickup Truck (1 ton)','Work Van','Box Truck','Dump Truck','Flatbed Truck','Other'] },
        { key: 'detail', label: 'Year / Make / Model', type: 'text', placeholder: 'e.g. 2022 Ford F-350' },
        { key: 'cost',   label: 'Estimated Cost ($)', type: 'number', placeholder: '0' },
        { key: 'notes',  label: 'New or Used? Notes', type: 'text', placeholder: 'Financing or cash?' },
      ],
    },
  },
  {
    key: 'labor', label: 'Staffing', icon: '👷',
    tagline: 'Grow your team',
    smartForm: {
      title: 'Add Staff Position',
      costMode: 'computed',
      fields: [
        { key: 'type',    label: 'Role',             type: 'select', options: ['Crew Member','Crew Leader','Field Supervisor','Spray Technician','Sales Rep','Office / Admin','Owner Draw','Seasonal Help','Other'] },
        { key: 'detail',  label: 'Name (optional)',   type: 'text',   placeholder: 'e.g. New hire — spring 2026' },
        { key: 'rate',    label: 'Pay Rate ($/hr)',   type: 'number', placeholder: '20' },
        { key: 'hours',   label: 'Hours / Week',      type: 'number', placeholder: '40' },
        { key: 'notes',   label: 'Notes',             type: 'text',   placeholder: 'What capacity does this person add?' },
      ],
    },
  },
  {
    key: 'technology', label: 'Technology', icon: '💻',
    tagline: 'Tools to work smarter',
    smartForm: {
      title: 'Add Technology',
      costMode: 'direct',
      fields: [
        { key: 'type',   label: 'Technology Type',  type: 'select', options: ['CRM / Job Management Software','Route Optimization','GPS Fleet Tracking','Tablet / iPad','Smartphone','Accounting Software','Estimating Software','Website / SEO','Security Camera System','Other'] },
        { key: 'detail', label: 'Product / Service', type: 'text',  placeholder: 'e.g. Jobber, ServiceTitan, etc.' },
        { key: 'cost',   label: 'Cost ($)',           type: 'number', placeholder: '0' },
        { key: 'notes',  label: 'Monthly or one-time?', type: 'text', placeholder: 'Subscription or purchase?' },
      ],
    },
  },
  {
    key: 'facility', label: 'Shop / Facility', icon: '🏢',
    tagline: 'A home base for your business',
    smartForm: {
      title: 'Add Facility / Shop',
      costMode: 'direct',
      fields: [
        { key: 'type',    label: 'Facility Type',    type: 'select', options: ['Shop / Garage (buy)','Shop / Garage (rent)','Storage Unit','Office Space','Outdoor Yard / Lot','Other'] },
        { key: 'detail',  label: 'Location / Address', type: 'text', placeholder: 'City or address' },
        { key: 'cost',    label: 'Estimated Cost ($)', type: 'number', placeholder: '0' },
        { key: 'notes',   label: 'Monthly rent or purchase? Notes', type: 'text', placeholder: '' },
      ],
    },
  },
  {
    key: 'other', label: 'Other', icon: '📦',
    tagline: 'Training, licensing, branding…',
    smartForm: {
      title: 'Add Growth Item',
      costMode: 'direct',
      fields: [
        { key: 'type',   label: 'Type',             type: 'select', options: ['Training / Certification','Business License / Permit','Insurance Upgrade','Branding / Logo','Trade Show / Networking','Legal / Accounting','Other'] },
        { key: 'detail', label: 'Description',       type: 'text',  placeholder: 'What is it?' },
        { key: 'cost',   label: 'Estimated Cost ($)', type: 'number', placeholder: '0' },
        { key: 'notes',  label: 'Notes',             type: 'text',  placeholder: '' },
      ],
    },
  },
];

const PRIORITY_COLORS: Record<BudgetPriority, string> = {
  low:    'bg-gray-100 text-gray-600 border-gray-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high:   'bg-red-50 text-red-700 border-red-200',
};
const STATUS_COLORS: Record<BudgetStatus, string> = {
  planning:  'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  purchased: 'bg-gray-100 text-gray-500',
};

// ─── Smart Form State ─────────────────────────────────────────────────────────
interface SmartFormState {
  type: string;
  detail: string;
  cost: number;
  rate: number;
  hours: number;
  notes: string;
  link: string;
  priority: BudgetPriority;
  status: BudgetStatus;
  targetDate: string;
  // Equipment/vehicle fields
  purchaseCost: number;
  usefulLifeMonths: number;
  maintenancePct: number;
  paymentType: 'paid_in_full' | 'monthly_payment';
  monthlyPaymentAmount: number;
}

function blankSmart(): SmartFormState {
  return { type:'', detail:'', cost:0, rate:20, hours:40, notes:'', link:'', priority:'medium', status:'planning', targetDate:'',
    purchaseCost:0, usefulLifeMonths:60, maintenancePct:5, paymentType:'paid_in_full', monthlyPaymentAmount:0 };
}

function computedMonthlyCost(cat: BudgetCategory, sf: SmartFormState): number {
  if (cat === 'labor') return sf.rate * sf.hours * 4.33;
  if (cat === 'equipment' || cat === 'vehicle') {
    if (sf.paymentType === 'monthly_payment') return sf.monthlyPaymentAmount;
    return calcEqMonthly(sf.purchaseCost, sf.usefulLifeMonths, sf.maintenancePct);
  }
  return sf.cost;
}

function buildName(cat: BudgetCategory, sf: SmartFormState): string {
  if (cat === 'labor') return sf.type + (sf.detail ? ` — ${sf.detail}` : '');
  if (sf.detail) return `${sf.type}: ${sf.detail}`;
  return sf.type;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GrowthBudget({ data, setData }: Props) {
  const [activeCat, setActiveCat]             = useState<CatDef | null>(null);
  const [smartForm, setSmartForm]             = useState<SmartFormState>(blankSmart());
  const [editingItem, setEditingItem]         = useState<FutureBudgetItem | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [filterCat, setFilterCat]             = useState<BudgetCategory | 'all'>('all');

  // ── Current costs ──
  const monthlyLabor    = calcMonthlyLaborCost(data);
  const monthlyOverhead = data.overhead.reduce((s, o) => s + o.monthlyCost, 0);
  const monthlyDeprec   = data.equipment.reduce((s, e) => s + e.monthlyDepreciation, 0);
  const monthlySupplies = data.fieldSupplies.reduce((s, f) => s + f.unitCost * f.monthlyUsage, 0);
  const currentMonthlyCost = monthlyLabor + monthlyOverhead + monthlyDeprec + monthlySupplies;
  const margin = data.settings.targetMargin / 100;
  const revenueNeededNow = margin < 1 ? currentMonthlyCost / (1 - margin) : currentMonthlyCost * 2;

  // ── Growth items ──
  const planned   = data.futureBudget.filter(b => b.status !== 'purchased');
  const purchased = data.futureBudget.filter(b => b.status === 'purchased');
  const filtered  = filterCat === 'all' ? planned : planned.filter(b => b.category === filterCat);

  function estimateMonthlyImpact(item: FutureBudgetItem): number {
    // estimatedCost is always the monthly cost now (equipment stores depreciation/payment directly)
    return item.estimatedCost;
  }

  const addedMonthly       = planned.reduce((s, b) => s + estimateMonthlyImpact(b), 0);
  const totalCapitalNeeded = planned
    .filter(b => b.category === 'equipment' || b.category === 'vehicle')
    .reduce((s, b) => s + (b.purchaseCost ?? 0), 0);
  const totalWithGrowth = currentMonthlyCost + addedMonthly;
  const revenueWithGrowth = margin < 1 ? totalWithGrowth / (1 - margin) : totalWithGrowth * 2;

  // ── Open smart form for a category ──
  function openCat(cat: CatDef, existing?: FutureBudgetItem) {
    setActiveCat(cat);
    if (existing) {
      setEditingItem(existing);
      // Try to reconstruct smart form from the saved item
      const parts = existing.name.split(': ');
      setSmartForm({
        type: parts[0] ?? '',
        detail: parts.slice(1).join(': '),
        cost: existing.estimatedCost,
        rate: 20,
        hours: 40,
        notes: existing.notes,
        link: existing.link ?? '',
        priority: existing.priority,
        status: existing.status,
        targetDate: existing.targetDate,
        purchaseCost: existing.purchaseCost ?? 0,
        usefulLifeMonths: existing.usefulLifeMonths ?? 60,
        maintenancePct: existing.maintenancePct ?? 5,
        paymentType: existing.paymentType ?? 'paid_in_full',
        monthlyPaymentAmount: existing.monthlyPaymentAmount ?? 0,
      });
    } else {
      setEditingItem(null);
      setSmartForm({...blankSmart(), type: cat.smartForm.fields[0].options?.[0] ?? ''});
    }
  }

  function closeModal() {
    setActiveCat(null);
    setEditingItem(null);
  }

  function moveToResources(item: FutureBudgetItem) {
    if (!confirm(`Move "${item.name}" to Resources equipment list?`)) return;
    const purchaseCost = item.purchaseCost ?? item.estimatedCost * (item.usefulLifeMonths ?? 60);
    const newEq: Equipment = {
      id: `eq_${Date.now()}`,
      name: item.name,
      purchaseDate: new Date().toISOString().slice(0, 10),
      purchaseCost,
      usefulLifeYears: (item.usefulLifeMonths ?? 60) / 12,
      monthlyDepreciation: calcEqMonthly(purchaseCost, item.usefulLifeMonths ?? 60, item.maintenancePct ?? 5),
      monthlyMaintenancePct: item.maintenancePct ?? 5,
      paymentType: item.paymentType ?? 'paid_in_full',
      monthlyPaymentAmount: item.monthlyPaymentAmount ?? 0,
      seasons: ['spring', 'summer', 'fall', 'winter'],
      notes: item.notes,
    };
    const updated = {
      ...data,
      equipment: [...data.equipment, newEq],
      futureBudget: data.futureBudget.map(b => b.id === item.id ? {...b, status: 'purchased' as BudgetStatus} : b),
    };
    setData(updated); saveData(updated);
  }

  function saveItem() {
    if (!activeCat) return;
    const monthly = computedMonthlyCost(activeCat.key, smartForm);
    const name    = buildName(activeCat.key, smartForm) || smartForm.type || activeCat.label;
    const isEq    = activeCat.key === 'equipment' || activeCat.key === 'vehicle';

    const payload: Omit<FutureBudgetItem,'id'|'createdAt'> = {
      name,
      category:      activeCat.key,
      estimatedCost: monthly,
      priority:      smartForm.priority,
      status:        smartForm.status,
      targetDate:    smartForm.targetDate,
      notes:         smartForm.notes,
      link:          smartForm.link || undefined,
      ...(isEq && {
        purchaseCost:        smartForm.purchaseCost,
        usefulLifeMonths:    smartForm.usefulLifeMonths,
        maintenancePct:      smartForm.maintenancePct,
        paymentType:         smartForm.paymentType,
        monthlyPaymentAmount: smartForm.monthlyPaymentAmount,
      }),
    };

    let updated: AppData;
    if (editingItem) {
      updated = {...data, futureBudget: data.futureBudget.map(b => b.id === editingItem.id ? {...editingItem, ...payload} : b)};
    } else {
      updated = {...data, futureBudget: [...data.futureBudget, {id:`budget_${Date.now()}`, createdAt: new Date().toISOString(), ...payload}]};
    }
    setData(updated); saveData(updated); closeModal();
  }

  function del(id: string) {
    const updated = {...data, futureBudget: data.futureBudget.filter(b => b.id !== id)};
    setData(updated); saveData(updated);
  }

  function duplicate(item: FutureBudgetItem) {
    const copy: FutureBudgetItem = { ...item, id: `fb_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, name: `${item.name} (copy)`, status: 'planning', createdAt: new Date().toISOString() };
    const updated = {...data, futureBudget: [...data.futureBudget, copy]};
    setData(updated); saveData(updated);
  }

  function clearAll() {
    const updated = {...data, futureBudget: []};
    setData(updated); saveData(updated);
    setShowClearConfirm(false);
  }

  // ── Computed monthly for the current smart form ──
  const previewMonthly = activeCat ? computedMonthlyCost(activeCat.key, smartForm) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Growth Budget"
        subtitle="What do you need to get more work in the door?"
        action={
          <button className="btn-secondary text-sm text-red-500 hover:text-red-600" onClick={() => setShowClearConfirm(true)}>
            Clear All
          </button>
        }
      />

      {/* ── Current cost baseline ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Labor',      amount: monthlyLabor,    color: 'border-l-[#27AE60]' },
          { label: 'Overhead',   amount: monthlyOverhead, color: 'border-l-blue-400'  },
          { label: 'Equipment',  amount: monthlyDeprec,   color: 'border-l-amber-400' },
          { label: 'Supplies',   amount: monthlySupplies, color: 'border-l-purple-400'},
        ].map(c => (
          <div key={c.label} className={`card p-3 border-l-4 ${c.color}`}>
            <p className="text-xs text-gray-500 font-semibold uppercase">{c.label}</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(c.amount)}<span className="text-xs font-normal text-gray-400">/mo</span></p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 bg-gray-50">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">Current Monthly Cost</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(currentMonthlyCost)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
          <p className="text-xs text-gray-400 mt-1">Need <span className="font-semibold text-gray-600">{formatCurrency(revenueNeededNow)}/mo</span> at {data.settings.targetMargin}% margin</p>
        </div>
        {planned.length > 0 && (
          <div className="card p-4 bg-green-50 border border-green-200">
            <p className="text-xs text-[#27AE60] uppercase font-bold tracking-wide">With Growth Plan</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalWithGrowth)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
            <p className="text-xs text-gray-500 mt-1">Revenue needed: <span className="font-semibold text-[#27AE60]">{formatCurrency(revenueWithGrowth)}/mo</span></p>
            <p className="text-xs text-amber-600 font-medium">+{formatCurrency(revenueWithGrowth - revenueNeededNow)}/mo additional revenue required</p>
          </div>
        )}
        {totalCapitalNeeded > 0 && (
          <div className="card p-4 bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700 uppercase font-bold tracking-wide">Capital Required</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalCapitalNeeded)}</p>
            <p className="text-xs text-amber-600 mt-1">Total purchase price of planned equipment & vehicles</p>
          </div>
        )}
      </div>

      {/* ── Category tiles ── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Click a category to add an item</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {CATEGORIES.map(cat => {
            const count = planned.filter(b => b.category === cat.key).length;
            const total = planned.filter(b => b.category === cat.key).reduce((s, b) => s + b.estimatedCost, 0);
            return (
              <button
                key={cat.key}
                onClick={() => openCat(cat)}
                className="card p-3 text-left hover:border-[#27AE60] hover:bg-green-50 border-2 border-transparent transition-all group"
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-2xl">{cat.icon}</span>
                  {count > 0 && (
                    <span className="text-[10px] bg-[#27AE60] text-white px-1.5 py-0.5 rounded-full font-bold">{count}</span>
                  )}
                </div>
                <p className="text-xs font-bold text-gray-800 group-hover:text-[#27AE60] leading-tight">{cat.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{cat.tagline}</p>
                {count > 0 && (
                  <p className="text-[10px] font-semibold text-[#27AE60] mt-1">{formatCurrency(total)}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Planned items table ── */}
      {planned.length > 0 && (
        <div>
          {/* Filter row */}
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-1">Filter:</p>
            {(['all', ...CATEGORIES.map(c => c.key)] as const).map(k => {
              const label = k === 'all' ? 'All' : CATEGORIES.find(c => c.key === k)?.label ?? k;
              const count = k === 'all' ? planned.length : planned.filter(b => b.category === k).length;
              if (count === 0 && k !== 'all') return null;
              return (
                <button
                  key={k}
                  onClick={() => setFilterCat(k)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold border transition-all ${
                    filterCat === k ? 'bg-[#27AE60] text-white border-[#27AE60]' : 'text-gray-500 border-gray-200 hover:border-[#27AE60] bg-white'
                  }`}
                >
                  {label} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>

          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Item','Category','Monthly Impact','Priority','Status','Target',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...filtered].sort((a,b) => {
                  const p: Record<BudgetPriority,number> = {high:0,medium:1,low:2};
                  return p[a.priority] - p[b.priority];
                }).map(item => {
                  const cat = CATEGORIES.find(c => c.key === item.category);
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 border-l-4 ${PRIORITY_COLORS[item.priority]}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{cat?.icon}</span>
                          <div>
                            {item.name}
                            {item.notes && <p className="text-xs text-gray-400 font-normal mt-0.5">{item.notes}</p>}
                            {item.link && (
                              <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline font-normal mt-0.5 block truncate max-w-[200px]">
                                🔗 View listing
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{cat?.label}</td>
                      <td className="px-4 py-3 text-amber-600 font-semibold">
                        {formatCurrency(item.estimatedCost)}/mo
                        {(item.category === 'equipment' || item.category === 'vehicle') && (
                          <p className="text-[10px] text-gray-400 font-normal">
                            purchase: {formatCurrency(item.purchaseCost ?? item.estimatedCost * (item.usefulLifeMonths ?? 60))}
                            {item.paymentType === 'monthly_payment' && ' · loan'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${PRIORITY_COLORS[item.priority]}`}>{item.priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_COLORS[item.status]}`}>{item.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{item.targetDate || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 items-center">
                          {(item.category === 'equipment' || item.category === 'vehicle') && item.status !== 'purchased' && (
                            <button className="text-xs text-purple-600 hover:underline font-semibold" onClick={() => moveToResources(item)}>→ Resources</button>
                          )}
                          <button className="text-xs text-[#27AE60] hover:underline" onClick={() => openCat(CATEGORIES.find(c => c.key === item.category)!, item)}>Edit</button>
                          <button className="text-xs text-blue-500 hover:underline" onClick={() => duplicate(item)}>Dup</button>
                          <button className="text-xs text-red-500 hover:underline" onClick={() => del(item.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {planned.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-4xl mb-3">📈</p>
          <p className="font-semibold text-gray-700 text-lg">Nothing planned yet</p>
          <p className="text-sm text-gray-400 mt-1">Click a category above to start planning your next investment.</p>
        </div>
      )}

      {/* Purchased archive */}
      {purchased.length > 0 && (
        <details className="card p-3">
          <summary className="text-sm font-semibold text-gray-500 cursor-pointer">
            Purchased ({purchased.length} · {formatCurrency(purchased.reduce((s,b)=>s+b.estimatedCost,0))}/mo)
          </summary>
          <div className="mt-3 space-y-1">
            {purchased.map(item => {
              const cat = CATEGORIES.find(c => c.key === item.category);
              return (
                <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-400 line-through flex items-center gap-2"><span>{cat?.icon}</span>{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{formatCurrency(item.estimatedCost)}/mo</span>
                    <button className="text-xs text-[#27AE60] hover:underline" onClick={() => openCat(cat!, item)}>Edit</button>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => del(item.id)}>Del</button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ── Smart Form Modal ── */}
      {activeCat && (
        <Modal title={editingItem ? `Edit: ${editingItem.name}` : activeCat.smartForm.title} onClose={closeModal} size="md">
          <div className="space-y-4">
            {/* Category badge */}
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <span className="text-2xl">{activeCat.icon}</span>
              <div>
                <p className="font-semibold text-gray-800">{activeCat.label}</p>
                <p className="text-xs text-gray-400">{activeCat.tagline}</p>
              </div>
            </div>

            {/* Equipment/Vehicle: custom form */}
            {(activeCat.key === 'equipment' || activeCat.key === 'vehicle') ? (
              <div className="space-y-4">
                <div>
                  <label className="label">{activeCat.key === 'vehicle' ? 'Vehicle Type' : 'Equipment Type'}</label>
                  <select className="input" value={smartForm.type} onChange={e => setSmartForm(f => ({...f, type: e.target.value}))}>
                    {activeCat.smartForm.fields[0].options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">{activeCat.key === 'vehicle' ? 'Year / Make / Model' : 'Brand / Model'}</label>
                  <input className="input" type="text" placeholder={activeCat.key === 'vehicle' ? 'e.g. 2025 Ford F-350' : 'e.g. Hustler Super Z 60"'} value={smartForm.detail} onChange={e => setSmartForm(f => ({...f, detail: e.target.value}))} />
                </div>
                {/* Payment type toggle */}
                <div>
                  <label className="label">Payment Type</label>
                  <div className="flex rounded-lg overflow-hidden border border-gray-200">
                    <button type="button" onClick={() => setSmartForm(f => ({...f, paymentType: 'paid_in_full'}))}
                      className={`flex-1 py-2 text-sm font-semibold transition-colors ${smartForm.paymentType === 'paid_in_full' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      Paid in Full
                    </button>
                    <button type="button" onClick={() => setSmartForm(f => ({...f, paymentType: 'monthly_payment'}))}
                      className={`flex-1 py-2 text-sm font-semibold border-l border-gray-200 transition-colors ${smartForm.paymentType === 'monthly_payment' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      Monthly Payment
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Purchase Price ($)</label>
                    <input className="input" type="number" min="0" placeholder="0"
                      value={smartForm.purchaseCost || ''}
                      onChange={e => {
                        const pc = Number(e.target.value);
                        setSmartForm(f => ({...f, purchaseCost: pc}));
                      }} />
                  </div>
                  <div>
                    <label className="label">Useful Life</label>
                    <select className="input" value={smartForm.usefulLifeMonths}
                      onChange={e => setSmartForm(f => ({...f, usefulLifeMonths: Number(e.target.value)}))}>
                      {LONGEVITY_OPTIONS.map(o => <option key={o.months} value={o.months}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Maintenance Reserve (%)</label>
                    <input className="input" type="number" min="0" max="20" step="0.5"
                      value={smartForm.maintenancePct}
                      onChange={e => setSmartForm(f => ({...f, maintenancePct: Number(e.target.value)}))} />
                    <p className="text-xs text-gray-400 mt-1">% of purchase cost/year for upkeep</p>
                  </div>
                  {smartForm.paymentType === 'monthly_payment' && (
                    <div>
                      <label className="label">Monthly Payment ($)</label>
                      <input className="input" type="number" min="0" placeholder="0"
                        value={smartForm.monthlyPaymentAmount || ''}
                        onChange={e => setSmartForm(f => ({...f, monthlyPaymentAmount: Number(e.target.value)}))} />
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input className="input" type="text" placeholder="New or used? Where are you buying from?" value={smartForm.notes} onChange={e => setSmartForm(f => ({...f, notes: e.target.value}))} />
                </div>
                <div>
                  <label className="label">Price Source / Listing URL</label>
                  <input className="input" type="url" placeholder="https://..." value={smartForm.link} onChange={e => setSmartForm(f => ({...f, link: e.target.value}))} />
                  <p className="text-xs text-gray-400 mt-1">Link to where you found this price</p>
                </div>
              </div>
            ) : (
            /* All other categories: generic dynamic fields */
            activeCat.smartForm.fields.map(field => (
              <div key={field.key}>
                <label className="label">{field.label}</label>
                {field.type === 'select' ? (
                  <select className="input" value={(smartForm as unknown as Record<string,string>)[field.key]}
                    onChange={e => setSmartForm(f => ({...f, [field.key]: e.target.value}))}>
                    {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : field.type === 'number' ? (
                  <input className="input" type="number" placeholder={field.placeholder}
                    value={(smartForm as unknown as Record<string,number>)[field.key] || ''}
                    onChange={e => setSmartForm(f => ({...f, [field.key]: Number(e.target.value)}))} />
                ) : field.type === 'month' ? (
                  <input className="input" type="month"
                    value={(smartForm as unknown as Record<string,string>)[field.key]}
                    onChange={e => setSmartForm(f => ({...f, [field.key]: e.target.value}))} />
                ) : (
                  <input className="input" type="text" placeholder={field.placeholder}
                    value={(smartForm as unknown as Record<string,string>)[field.key]}
                    onChange={e => setSmartForm(f => ({...f, [field.key]: e.target.value}))} />
                )}
                {activeCat.key === 'labor' && field.key === 'hours' && smartForm.rate > 0 && smartForm.hours > 0 && (
                  <p className="text-xs text-[#27AE60] mt-1 font-semibold">
                    → {formatCurrency(smartForm.rate * smartForm.hours * 4.33)}/mo estimated cost
                  </p>
                )}
              </div>
            ))
            )}

            {/* Priority / Status / Date row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Priority</label>
                <select className="input" value={smartForm.priority} onChange={e => setSmartForm(f => ({...f, priority: e.target.value as BudgetPriority}))}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={smartForm.status} onChange={e => setSmartForm(f => ({...f, status: e.target.value as BudgetStatus}))}>
                  <option value="planning">Planning</option>
                  <option value="approved">Approved</option>
                  <option value="purchased">Purchased</option>
                </select>
              </div>
              <div>
                <label className="label">Target</label>
                <input className="input" type="month" value={smartForm.targetDate} onChange={e => setSmartForm(f => ({...f, targetDate: e.target.value}))} />
              </div>
            </div>

            {/* Cost preview */}
            {previewMonthly > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm font-semibold text-amber-800">
                  Estimated monthly cost impact: <span className="text-base">+{formatCurrency(previewMonthly)}/mo</span>
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Additional revenue needed at {data.settings.targetMargin}% margin:{' '}
                  <span className="font-semibold">+{formatCurrency(margin < 1 ? previewMonthly / (1 - margin) : previewMonthly * 2)}/mo</span>
                </p>
                {activeCat.key === 'labor' && (
                  <p className="text-xs text-amber-500 mt-0.5">Note: add {(data.settings.payrollBurdenPercent ?? 13)}% payroll burden on top for true cost</p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button className="btn-primary flex-1" onClick={saveItem}>
                {editingItem ? 'Save Changes' : `Add to Growth Plan`}
              </button>
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Clear confirm */}
      {showClearConfirm && (
        <Modal title="Clear All Items?" onClose={() => setShowClearConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">This removes all {data.futureBudget.length} items from your growth plan. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm transition-colors"
                onClick={clearAll}
              >
                Yes, Clear All
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowClearConfirm(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
