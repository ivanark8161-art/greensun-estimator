import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type {
  AppData, EstimateLineItem, PropertyType, Month, Contract, ServiceCatalogItem,
  LandscapingProject, ProjectStatus,
} from '../types';
import { MONTHS, MONTH_LABELS, calcLineItemTotals, lineItemMargin } from '../types';
import {
  formatCurrency, formatPercent, generateEstimateNumber, generateProjectNumber,
} from '../utils/calculations';
import { saveData } from '../utils/storage';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }
type JobType = 'maintenance' | 'landscaping';

function uid() { return `li_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

// ─── Line Item Row ─────────────────────────────────────────────────────────────
interface LineItemRowProps {
  item: EstimateLineItem;
  onChange: (updates: Partial<EstimateLineItem>) => void;
  onDelete: () => void;
  onRecalc?: () => void;
  targetMargin: number;
}

function LineItemRow({ item, onChange, onDelete, onRecalc, targetMargin }: LineItemRowProps) {
  const margin = lineItemMargin(item);
  const subtotal = item.qty * item.unitPrice;
  const costTotal = item.qty * item.unitCost;
  const overTarget = margin >= targetMargin;
  const nearTarget = margin >= targetMargin * 0.8;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50 group">
      <td className="px-3 py-2 min-w-[160px]">
        <input
          className="w-full text-sm font-medium text-gray-900 bg-transparent border-0 border-b border-transparent focus:border-[#27AE60] focus:outline-none px-0 py-0.5"
          value={item.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="Service name"
        />
        <input
          className="w-full text-xs text-gray-400 bg-transparent border-0 border-b border-transparent focus:border-gray-300 focus:outline-none px-0 py-0.5 mt-0.5"
          value={item.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Description (optional)"
        />
      </td>
      <td className="px-2 py-2 w-16">
        <input
          type="number" min="0" step="0.5"
          className="w-full text-sm text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
          value={item.qty || ''}
          onChange={e => onChange({ qty: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td className="px-2 py-2 w-24">
        <input
          className="w-full text-sm text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
          value={item.unit}
          onChange={e => onChange({ unit: e.target.value })}
          placeholder="unit"
        />
      </td>
      <td className="px-2 py-2 w-20">
        <input
          type="number" min="0" step="0.25"
          className="w-full text-sm text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
          value={item.estimatedHours ?? ''}
          onChange={e => onChange({ estimatedHours: parseFloat(e.target.value) || 0 })}
          title="Estimated labor hours per occurrence"
          placeholder="0"
        />
        <p className="text-[10px] text-center text-gray-400 mt-0.5">hrs/ea</p>
      </td>
      <td className="px-2 py-2 w-28">
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-sm">$</span>
          <input
            type="number" min="0" step="0.01"
            className="w-full text-sm text-gray-500 border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-amber-400 bg-amber-50/30"
            value={item.unitCost || ''}
            onChange={e => onChange({ unitCost: parseFloat(e.target.value) || 0 })}
            title="Your internal cost per unit"
          />
        </div>
        <p className="text-xs text-gray-400 text-center mt-0.5">{formatCurrency(costTotal)} total</p>
      </td>
      <td className="px-2 py-2 w-28">
        <div className="flex items-center gap-1">
          <span className="text-gray-600 text-sm">$</span>
          <input
            type="number" min="0" step="0.01"
            className="w-full text-sm font-semibold text-gray-900 border border-gray-300 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
            value={item.unitPrice || ''}
            onChange={e => onChange({ unitPrice: parseFloat(e.target.value) || 0 })}
            title="What you charge the client"
          />
        </div>
        <p className="text-xs text-gray-500 text-center mt-0.5 font-medium">{formatCurrency(subtotal)} total</p>
      </td>
      <td className="px-2 py-2 w-20 text-center">
        <span className={`text-sm font-bold ${overTarget ? 'text-green-600' : nearTarget ? 'text-yellow-600' : 'text-red-500'}`}>
          {item.unitPrice > 0 ? formatPercent(margin) : '—'}
        </span>
        <div className={`h-1 rounded-full mt-1 mx-1 ${overTarget ? 'bg-green-400' : nearTarget ? 'bg-yellow-400' : 'bg-red-400'}`}
          style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }} />
      </td>
      <td className="px-2 py-2 w-36">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-500">
            <input type="checkbox" checked={item.optional} onChange={e => onChange({ optional: e.target.checked })} className="accent-gray-400 w-3 h-3" />
            Optional
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-xs text-amber-600">
            <input type="checkbox" checked={item.isOneTime ?? false} onChange={e => onChange({ isOneTime: e.target.checked })} className="accent-amber-500 w-3 h-3" />
            One-time
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-xs text-blue-500">
            <input type="checkbox" checked={item.taxable} onChange={e => onChange({ taxable: e.target.checked })} className="accent-blue-500 w-3 h-3" />
            Taxable
          </label>
        </div>
        <input
          className="w-full text-xs text-gray-400 bg-transparent border-0 border-b border-transparent focus:border-gray-300 focus:outline-none px-0 py-0.5 mt-1"
          value={item.notes}
          onChange={e => onChange({ notes: e.target.value })}
          placeholder="Field notes..."
        />
      </td>
      <td className="px-2 py-2 w-12">
        <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRecalc && item.catalogItemId && (
            <button onClick={onRecalc} title="Recalculate from SF" className="text-blue-400 hover:text-blue-600 text-sm leading-none">↺</button>
          )}
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none">✕</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Catalog Picker Modal ──────────────────────────────────────────────────────
function CatalogPicker({ catalog, onSelect, onClose }: { catalog: ServiceCatalogItem[]; onSelect: (i: ServiceCatalogItem) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string>('all');
  const cats = ['all','maintenance','snow','landscaping','other'];
  const filtered = catalog.filter(i =>
    (cat === 'all' || i.category === cat) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Modal title="Add from Service Catalog" onClose={onClose} size="lg">
      <div className="space-y-3">
        <input className="input" placeholder="Search services..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div className="flex gap-2 flex-wrap">
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${cat === c ? 'bg-[#27AE60] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filtered.map(item => (
            <button key={item.id} onClick={() => { onSelect(item); onClose(); }}
              className="w-full text-left p-3 rounded-lg hover:bg-green-50 hover:border-[#27AE60] border border-transparent transition-all group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-[#27AE60]">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.description}</p>
                  {item.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{item.notes}</p>}
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(item.defaultUnitPrice)}<span className="text-xs font-normal text-gray-400">/{item.unit}</span></p>
                  <p className="text-xs text-gray-400">cost: {formatCurrency(item.defaultUnitCost)}/{item.unit}</p>
                  <p className="text-xs text-green-600 font-medium">
                    {item.defaultUnitPrice > 0 ? formatPercent(((item.defaultUnitPrice - item.defaultUnitCost) / item.defaultUnitPrice) * 100) + ' margin' : ''}
                  </p>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No services found.</p>}
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Estimator ────────────────────────────────────────────────────────────
export default function Estimator({ data, setData }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill  = (location.state ?? {}) as { clientId?: string; clientName?: string; address?: string; propertyType?: PropertyType };

  const editingContract = (prefill as { contractId?: string }).contractId
    ? data.contracts.find(c => c.id === (prefill as { contractId?: string }).contractId) ?? null
    : null;

  // ── Job type ──────────────────────────────────────────────────────────────
  const [jobType, setJobType] = useState<JobType>('maintenance');

  // ── Shared fields ─────────────────────────────────────────────────────────
  const [clientName, setClientName] = useState(editingContract?.clientName || prefill.clientName || '');
  const [clientId,   setClientId]   = useState(editingContract?.clientId   || prefill.clientId   || '');
  const [propertyType, setPropertyType] = useState<PropertyType>(editingContract?.propertyType || prefill.propertyType || 'commercial');
  const [address, setAddress]       = useState(editingContract?.address    || prefill.address    || '');
  const [city,    setCity]          = useState(editingContract?.city    || '');
  const [state,   setState]         = useState(editingContract?.state   || '');
  const [zip,     setZip]           = useState(editingContract?.zip     || '');
  const [clientEmail, setClientEmail] = useState(editingContract?.clientEmail || '');
  const [milesFromShop, setMilesFromShop] = useState(editingContract?.milesFromShop || 0);
  const [lineItems, setLineItems]   = useState<EstimateLineItem[]>(editingContract?.lineItems || []);
  const [notes, setNotes]           = useState(editingContract?.notes || '');
  const [terms, setTerms]           = useState(editingContract?.terms || 'Net 30. Late payment: 1.5%/month (18% annual).');
  const [showCatalog, setShowCatalog] = useState(false);
  const [taxRate,            setTaxRate]            = useState(editingContract?.taxRate            ?? data.settings.defaultTaxRate);
  const [discountAmount,     setDiscountAmount]     = useState(editingContract?.discountAmount     ?? 0);
  const [additionalOverhead, setAdditionalOverhead] = useState(editingContract?.additionalOverheadPct ?? 0);
  const [downPaymentReq,     setDownPaymentReq]     = useState(editingContract?.downPaymentRequired ?? 0);

  // ── Maintenance-only fields ───────────────────────────────────────────────
  const [turfSF,       setTurfSF]       = useState(editingContract?.turfSF       || 0);
  const [hardscapeSF,  setHardscapeSF]  = useState(editingContract?.hardscapeSF  || 0);
const [visitsPerMonth, setVisitsPerMonth] = useState(editingContract?.visitsPerMonth || 4);
  const [activeMonths, setActiveMonths] = useState<Month[]>(editingContract?.activeMonths || ['apr','may','jun','jul','aug','sep','oct']);

  // ── Scheduling (maintenance) ──────────────────────────────────────────────
  const [schedDay,      setSchedDay]      = useState<number | undefined>(editingContract?.scheduledDay);
  const [schedTime,     setSchedTime]     = useState(editingContract?.scheduledTime ?? '08:00');
  const [schedDuration, setSchedDuration] = useState(editingContract?.scheduledDurationMinutes ?? 120);

  // ── Landscaping-only fields ───────────────────────────────────────────────
  const [projectDescription, setProjectDescription] = useState('');
  const [projStartDate, setProjStartDate] = useState('');
  const [projEndDate,   setProjEndDate]   = useState('');
  const [projMaterialCost, setProjMaterialCost] = useState(0);
  const [projLaborHours,   setProjLaborHours]   = useState(0);

  // ── Snow fields (optionally included on maintenance estimates) ────────────
  const [includeSnow,        setIncludeSnow]        = useState(false);

  // ── Crew ─────────────────────────────────────────────────────────────────
  const [crewId, setCrewId] = useState(editingContract?.crewId ?? '');

  // ── Saved result ──────────────────────────────────────────────────────────
  const [savedContract, setSavedContract] = useState<Contract | null>(null);
  const [savedProject,  setSavedProject]  = useState<LandscapingProject | null>(null);

  // ── Derived totals ────────────────────────────────────────────────────────
  const { subtotalRevenue, totalCost, grossProfit, grossMargin } = calcLineItemTotals(lineItems);
  const overTarget = grossMargin >= data.settings.targetMargin;

  function handleClientSelect(id: string) {
    setClientId(id);
    const c = data.clients.find(cl => cl.id === id);
    if (c) {
      const prop = c.properties?.find(p => p.isBillingAddress) ?? c.properties?.[0];
      const contact = c.contacts?.find(ct => ct.isPrimary) ?? c.contacts?.[0];
      setClientName(c.companyName || c.name || '');
      setAddress(prop?.street1 || c.billingAddress || '');
      setCity(prop?.city || c.city || '');
      setState(prop?.state || c.state || '');
      setZip(prop?.zip || c.zip || '');
      setClientEmail(contact?.email || c.email || '');
      setPropertyType(c.type);
    }
  }

  // ── Snow item classifier (used for Quote Totals calculations) ────────────
  const SNOW_IDS = new Set(['svc16','svc17','svc18','svc19','svc20','snow_trip']);
  const isSnowItem = (i: EstimateLineItem) => SNOW_IDS.has(i.catalogItemId ?? '') || i.isSnowPerTrip === true || ['Drive Lane Plowing','Sidewalk Shoveling / Snowblowing','De-icing Material','Snow Removal'].some(n => i.name.startsWith(n));

  // Add snow flat-rate line item — pulls cost/price from svc20 catalog
  function addSnowFlatRate() {
    const existing = lineItems.find(i => i.catalogItemId === 'svc20' || i.catalogItemId === 'snow_flat');
    if (existing) return; // don't double-add
    const svc = data.serviceCatalog.find(s => s.id === 'svc20');
    const snowMonths = 5; // Nov–Mar
    setLineItems(prev => [...prev, {
      id: uid(), catalogItemId: 'svc20',
      name: svc?.name || 'Snow Removal (Monthly Flat)',
      description: svc?.description || 'Flat monthly winter rate — all events included (Nov–Mar)',
      qty: snowMonths, unit: 'month',
      unitCost: svc?.defaultUnitCost ?? 300,
      unitPrice: svc?.defaultUnitPrice ?? 550,
      estimatedHours: svc?.estimatedHours ?? 8,
      optional: false, taxable: false, isSnowPerTrip: false, notes: 'Nov–Mar · 5 months flat rate',
    }]);
  }

  // Add snow per-trip line item, calculated from Resources settings + property SF
  function addSnowPerTrip() {
    const existing = lineItems.find(i => i.isSnowPerTrip);
    if (existing) return; // don't double-add
    const s = data.settings;
    const totalSF = turfSF + hardscapeSF;
    const events1_5 = s.snowEvents1_5in ?? 10;
    const events4   = s.snowEvents4in   ?? 5;
    const eff1_5    = s.snowEffSFPerHr1_5in ?? 44000;
    const eff4      = s.snowEffSFPerHr4in   ?? 30000;
    const totalEvents = events1_5 + events4;
    let costPerTrip = 0;
    let pricePerTrip = 0;
    if (totalEvents > 0 && totalSF > 0) {
      const seasonHrs = (totalSF / eff1_5) * events1_5 + (totalSF / eff4) * events4;
      const avgHrsPerTrip = seasonHrs / totalEvents;
      const rawCost = avgHrsPerTrip * (s.plowingCostPerHour ?? 65);
      costPerTrip  = parseFloat(rawCost.toFixed(2));
      pricePerTrip = parseFloat((rawCost / (1 - (s.targetMargin / 100))).toFixed(2));
    }
    setLineItems(prev => [...prev, {
      id: uid(), catalogItemId: 'snow_trip', name: 'Snow Removal - Per Trip',
      description: `${totalSF.toLocaleString()} SF · ${events1_5} light events + ${events4} heavy events (est. ${totalEvents} trips/season)`,
      qty: totalEvents || 1, unit: 'trip',
      unitCost: costPerTrip, unitPrice: pricePerTrip,
      estimatedHours: 0,
      optional: false, taxable: false, isSnowPerTrip: true, notes: `Based on ${(turfSF + hardscapeSF).toLocaleString()} SF property`,
    }]);
  }

  // Blended crew rate (sum of member hourly rates × burden)
  function getBlendedRate(): number {
    const burden = 1 + (data.settings.payrollBurdenPercent ?? 13) / 100;
    const selectedCrew = crewId ? data.crews.find(c => c.id === crewId) : null;
    if (selectedCrew && selectedCrew.memberIds.length > 0) {
      const members = data.employees.filter(e => selectedCrew.memberIds.includes(e.id));
      return members.reduce((s, e) => s + e.hourlyRate * burden, 0);
    }
    const crewRates = data.crews.filter(c => c.memberIds.length > 0).map(c => {
      const members = data.employees.filter(e => c.memberIds.includes(e.id));
      return members.reduce((s, e) => s + e.hourlyRate * burden, 0);
    });
    return crewRates.length > 0
      ? crewRates.reduce((s, r) => s + r, 0) / crewRates.length
      : (data.settings.laborRatePerHour ?? 22) * burden;
  }

  // Calculate hours + cost for a catalog item based on current turf SF
  function calcFromSF(svc: ServiceCatalogItem): { hours: number; unitCost: number; unitPrice: number } {
    const s = data.settings;
    const sfPerHour = svc.estimatedHours > 0 ? 1000 / svc.estimatedHours : 0;
    const hours = sfPerHour > 0 && turfSF > 0 ? parseFloat((turfSF / sfPerHour).toFixed(2)) : 0;
    const eqCostPerVisit = data.equipment
      .filter(e => (svc.equipmentIds ?? []).includes(e.id))
      .reduce((sum, e) => sum + (e.paymentType === 'monthly_payment' ? e.monthlyPaymentAmount : e.monthlyDepreciation) / (visitsPerMonth || 4), 0);
    const rawCost = hours > 0 ? hours * getBlendedRate() + eqCostPerVisit : 0;
    const consumables = (s.consumablesPercent ?? 3) / 100;
    const ovhd = (s.overheadMarkupPercent ?? 3) / 100;
    const markedUpCost = rawCost > 0 ? rawCost * (1 + consumables) * (1 + ovhd) : 0;
    const marginPct = (svc.targetMargin ?? s.targetMargin) / 100;
    const unitCost  = parseFloat((markedUpCost || svc.defaultUnitCost).toFixed(2));
    const unitPrice = markedUpCost > 0 && marginPct < 1
      ? parseFloat((markedUpCost / (1 - marginPct)).toFixed(2))
      : svc.defaultUnitPrice;
    return { hours, unitCost, unitPrice };
  }

  function addFromCatalog(item: ServiceCatalogItem) {
    const { hours, unitCost, unitPrice } = jobType === 'maintenance' && turfSF > 0
      ? calcFromSF(item)
      : { hours: item.estimatedHours, unitCost: item.defaultUnitCost, unitPrice: item.defaultUnitPrice };
    // For recurring maintenance services (not snow, not monthly-unit), qty = visitsPerMonth so
    // monthly total = qty × unitPrice = visitsPerMonth × per-visit-price
    const isMonthlyUnit = item.unit === 'month';
    const isSnow = item.category === 'snow';
    const qty = (jobType === 'maintenance' && !isSnow && !isMonthlyUnit) ? visitsPerMonth : 1;
    setLineItems(prev => [...prev, {
      id: uid(), catalogItemId: item.id, name: item.name, description: item.description,
      qty, unit: item.unit, unitCost, unitPrice,
      estimatedHours: hours,
      optional: false, taxable: item.taxable, notes: '',
    }]);
  }

  function recalcLineItem(lineItem: EstimateLineItem) {
    const svc = data.serviceCatalog.find(s => s.id === lineItem.catalogItemId);
    if (!svc || turfSF === 0) return;
    const { hours, unitCost, unitPrice } = calcFromSF(svc);
    setLineItems(prev => prev.map(i => i.id === lineItem.id
      ? { ...i, estimatedHours: hours, unitCost, unitPrice }
      : i));
  }

  function addBlank() {
    setLineItems(prev => [...prev, {
      id: uid(), name: '', description: '', qty: 1,
      unit: jobType === 'maintenance' ? 'visit' : 'each',
      unitCost: 0, unitPrice: 0, estimatedHours: 0, optional: false, taxable: false, notes: '',
    }]);
  }

  const updateItem = useCallback((id: string, updates: Partial<EstimateLineItem>) => {
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  function removeItem(id: string) { setLineItems(prev => prev.filter(i => i.id !== id)); }

  function toggleMonth(m: Month) {
    setActiveMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  function setPreset(p: 'year' | 'seasonal' | 'summer') {
    if (p === 'year')     { setActiveMonths(['apr','may','jun','jul','aug','sep','oct'] as Month[]); setIncludeSnow(true); }
    if (p === 'seasonal') { setActiveMonths(['apr','may','jun','jul','aug','sep','oct'] as Month[]); setIncludeSnow(false); }
    if (p === 'summer')   { setActiveMonths(['may','jun','jul','aug','sep'] as Month[]); setIncludeSnow(false); }
  }

  // ── Save maintenance contract ─────────────────────────────────────────────
  function saveContract(status: 'estimate' | 'active') {
    if (!clientName.trim()) { alert('Please enter a client name'); return; }
    if (lineItems.length === 0) { alert('Add at least one line item'); return; }
    const { subtotalRevenue: rev, totalCost: cost, grossMargin: gm } = calcLineItemTotals(lineItems);
    // Auto-derive estimated hours/visit from line item hours
    const derivedHoursPerVisit = lineItems.filter(i => !i.optional).reduce((s, i) => s + (i.estimatedHours ?? 0), 0);

    let contract: Contract;
    let updated: AppData;

    const schedFields = {
      scheduledDay: schedDay,
      scheduledTime: schedDay !== undefined ? schedTime : undefined,
      scheduledDurationMinutes: schedDay !== undefined ? schedDuration : undefined,
    };

    const recurringMaintItems = lineItems.filter(i => !i.optional && !i.isOneTime && !isSnowItem(i));
    const snowSeasonItems     = lineItems.filter(i => !i.optional && isSnowItem(i));
    const recurringRev  = recurringMaintItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const snowSeasonRev = snowSeasonItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const annualRev = recurringRev * activeMonths.length + snowSeasonRev;

    if (editingContract) {
      contract = {
        ...editingContract,
        clientId: clientId || undefined, clientName: clientName.trim(),
        propertyType, address, city, state, zip, clientEmail, milesFromShop,
        turfSF, hardscapeSF, perimeterFt: 0,
        lineItems, visitsPerMonth, activeMonths,
        subtotalRevenue: rev, totalCost: cost, grossMargin: gm,
        monthlyRevenue: recurringRev, annualRevenue: annualRev,
        crewId: crewId || undefined,
        taxRate, discountAmount, additionalOverheadPct: additionalOverhead, consumablesPct: 0, downPaymentRequired: downPaymentReq,
        status, notes, terms, ...schedFields,
      };
      updated = { ...data, contracts: data.contracts.map(c => c.id === contract.id ? contract : c) };
    } else {
      const counter = (data.estimateCounter || 6) + 1;
      contract = {
        id: `c_${Date.now()}`,
        estimateNumber: generateEstimateNumber(counter),
        clientId: clientId || undefined, clientName: clientName.trim(),
        propertyType, address, city, state, zip, clientEmail, milesFromShop,
        turfSF, hardscapeSF, perimeterFt: 0,
        lineItems, visitsPerMonth, activeMonths,
        subtotalRevenue: rev, totalCost: cost, grossMargin: gm,
        monthlyRevenue: recurringRev, annualRevenue: annualRev,
        estimatedHoursPerVisit: derivedHoursPerVisit > 0 ? derivedHoursPerVisit : 2,
        crewId: crewId || undefined,
        taxRate, discountAmount, additionalOverheadPct: additionalOverhead, consumablesPct: 0, downPaymentRequired: downPaymentReq,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '', status, notes, terms,
        createdAt: new Date().toISOString(),
        ...schedFields,
      };
      updated = { ...data, estimateCounter: counter, contracts: [...data.contracts, contract] };
    }

    setData(updated); saveData(updated);
    setSavedContract(contract);
  }

  // ── Save landscaping project ──────────────────────────────────────────────
  function saveProject(status: ProjectStatus) {
    if (!clientName.trim()) { alert('Please enter a client name'); return; }
    if (lineItems.length === 0) { alert('Add at least one line item'); return; }
    const { subtotalRevenue: rev, totalCost: cost, grossMargin: gm } = calcLineItemTotals(lineItems);
    const counter = data.projectCounter + 1;
    const project: LandscapingProject = {
      id: `proj_${Date.now()}`,
      projectNumber: generateProjectNumber(counter),
      clientId: clientId || undefined,
      clientName: clientName.trim(),
      address,
      description: projectDescription,
      status,
      startDate: projStartDate,
      endDate: projEndDate,
      estimatedHours: projLaborHours,
      estimatedMaterialCost: projMaterialCost,
      lineItems,
      subtotalRevenue: rev,
      totalCost: cost,
      grossMargin: gm,
      notes,
      createdAt: new Date().toISOString(),
    };
    const updated = { ...data, projectCounter: counter, projects: [...data.projects, project] };
    setData(updated); saveData(updated);
    setSavedProject(project);
  }

  function startAnother() {
    setSavedContract(null); setSavedProject(null);
    setClientName(''); setClientId(''); setAddress('');
    setCity(''); setState(''); setZip(''); setClientEmail(''); setMilesFromShop(0);
    setPropertyType('commercial'); setLineItems([]);
    setVisitsPerMonth(4);
    setActiveMonths(['apr','may','jun','jul','aug','sep','oct'] as Month[]);
    setProjectDescription(''); setProjStartDate(''); setProjEndDate('');
    setProjMaterialCost(0); setProjLaborHours(0);
    setIncludeSnow(false);
    setCrewId('');
    setSchedDay(undefined); setSchedTime('08:00'); setSchedDuration(120);
    setNotes(''); setTerms('Net 30. Late payment: 1.5%/month (18% annual).');
    setTaxRate(data.settings.defaultTaxRate); setDiscountAmount(0); setAdditionalOverhead(0); setDownPaymentReq(0);
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (savedContract) {
    const { subtotalRevenue: rev, totalCost: cost, grossMargin: gm } = calcLineItemTotals(savedContract.lineItems);
    return (
      <div className="p-6 max-w-xl mx-auto flex flex-col items-center text-center mt-16">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4 text-3xl">✓</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{editingContract ? 'Estimate Updated' : 'Estimate Saved'}</h2>
        <p className="text-gray-500 mb-6">Maintenance contract #{savedContract.estimateNumber} has been {editingContract ? 'updated' : 'created'}.</p>
        <div className="card w-full text-left mb-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-mono text-xs text-gray-400">#{savedContract.estimateNumber}</p>
              <p className="text-lg font-bold text-gray-900">{savedContract.clientName}</p>
              <p className="text-sm text-gray-500">{savedContract.address}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${savedContract.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {savedContract.status}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center border-t pt-3">
            <div><p className="text-xs text-gray-400">Monthly</p><p className="font-bold text-[#27AE60]">{formatCurrency(rev)}</p></div>
            <div><p className="text-xs text-gray-400">My Cost</p><p className="font-bold text-amber-600">{formatCurrency(cost)}</p></div>
            <div><p className="text-xs text-gray-400">Margin</p><p className={`font-bold ${gm >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>{formatPercent(gm)}</p></div>
          </div>
        </div>
        <div className="flex gap-3 w-full">
          <button className="btn-primary flex-1" onClick={() => navigate(savedContract.status === 'estimate' ? '/pipeline' : '/projects')}>
            {savedContract.status === 'estimate' ? 'View in Pipeline →' : 'View in Jobs →'}
          </button>
          <button className="btn-secondary flex-1" onClick={startAnother}>New Estimate</button>
        </div>
      </div>
    );
  }

  if (savedProject) {
    const { subtotalRevenue: rev, totalCost: cost, grossMargin: gm } = calcLineItemTotals(savedProject.lineItems);
    return (
      <div className="p-6 max-w-xl mx-auto flex flex-col items-center text-center mt-16">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4 text-3xl">✓</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Project Saved</h2>
        <p className="text-gray-500 mb-6">Landscaping project #{savedProject.projectNumber} has been created.</p>
        <div className="card w-full text-left mb-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-mono text-xs text-gray-400">#{savedProject.projectNumber}</p>
              <p className="text-lg font-bold text-gray-900">{savedProject.clientName}</p>
              <p className="text-sm text-gray-500">{savedProject.description || savedProject.address}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${savedProject.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {savedProject.status}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center border-t pt-3">
            <div><p className="text-xs text-gray-400">Project Total</p><p className="font-bold text-[#27AE60]">{formatCurrency(rev)}</p></div>
            <div><p className="text-xs text-gray-400">My Cost</p><p className="font-bold text-amber-600">{formatCurrency(cost)}</p></div>
            <div><p className="text-xs text-gray-400">Margin</p><p className={`font-bold ${gm >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>{formatPercent(gm)}</p></div>
          </div>
        </div>
        <div className="flex gap-3 w-full">
          <button className="btn-primary flex-1" onClick={() => navigate('/projects')}>View in Jobs →</button>
          <button className="btn-secondary flex-1" onClick={startAnother}>New Estimate</button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title={editingContract ? `Edit Estimate #${editingContract.estimateNumber}` : 'New Estimate'}
        subtitle="Build a line-item quote — see your costs and margins on every service"
      />

      {/* ── Job Type Selector ─────────────────────────────────────────────── */}
      {!editingContract && (
        <div className="card mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">What type of job is this?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setJobType('maintenance')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${jobType === 'maintenance' ? 'border-[#27AE60] bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
              <p className={`font-semibold text-base ${jobType === 'maintenance' ? 'text-[#27AE60]' : 'text-gray-800'}`}>🌿 Maintenance Contract</p>
              <p className="text-xs text-gray-500 mt-1">Recurring lawn care + optional snow removal — billed monthly. Revenue counts toward MRR.</p>
            </button>
            <button
              onClick={() => setJobType('landscaping')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${jobType === 'landscaping' ? 'border-[#27AE60] bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
              <p className={`font-semibold text-base ${jobType === 'landscaping' ? 'text-[#27AE60]' : 'text-gray-800'}`}>🏗 Landscaping Project</p>
              <p className="text-xs text-gray-500 mt-1">Patio install, sod, hardscape, cleanup — billed once. Tracked separately from monthly revenue.</p>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-6">
        {/* ── Left: Inputs ───────────────────────────────────────────────── */}
        <div className="col-span-5 space-y-5">

          {/* Client + Property */}
          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Client & Property</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="label">Client Name *</label>
                <div className="flex gap-2">
                  <input className="input flex-1" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Mills Church" />
                  {data.clients.length > 0 && (
                    <select className="input w-36 text-xs" value={clientId} onChange={e => handleClientSelect(e.target.value)}>
                      <option value="">Existing client...</option>
                      {data.clients.map(c => <option key={c.id} value={c.id}>{c.companyName || c.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div>
                <label className="label">Property Type</label>
                <select className="input" value={propertyType} onChange={e => setPropertyType(e.target.value as PropertyType)}>
                  <option value="commercial">Commercial</option>
                  <option value="residential">Residential</option>
                </select>
              </div>
              <div className="col-span-3">
                <label className="label">Street Address</label>
                <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Minneapolis" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">State</label>
                  <input className="input" value={state} onChange={e => setState(e.target.value)} placeholder="MN" maxLength={2} />
                </div>
                <div>
                  <label className="label">ZIP</label>
                  <input className="input" value={zip} onChange={e => setZip(e.target.value)} placeholder="55401" />
                </div>
              </div>
              <div>
                <label className="label">Client Email</label>
                <input className="input" type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" />
              </div>
              <div className="col-span-3">
                <label className="label">
                  Miles from Shop
                  {data.settings.shopAddress && <span className="text-gray-400 font-normal ml-1">(from {data.settings.shopAddress})</span>}
                </label>
                <div className="flex items-center gap-3">
                  <input className="input w-32" type="number" min="0" step="0.1" value={milesFromShop || ''} onChange={e => setMilesFromShop(parseFloat(e.target.value) || 0)} placeholder="0" />
                  <span className="text-sm text-gray-400">miles one-way</span>
                  {milesFromShop > 0 && (() => {
                    const s = data.settings;
                    const driveHrs = (milesFromShop / (s.averageSpeedMph || 30)) * 2;
                    return <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">{driveHrs.toFixed(1)} hrs round trip</span>;
                  })()}
                </div>
              </div>

              {/* Landscaping-specific fields */}
              {jobType === 'landscaping' && (
                <>
                  <div className="col-span-3">
                    <label className="label">Project Description</label>
                    <input className="input" value={projectDescription} onChange={e => setProjectDescription(e.target.value)} placeholder="e.g. Backyard patio install + sod replacement" />
                  </div>
                  <div>
                    <label className="label">Start Date</label>
                    <input className="input" type="date" value={projStartDate} onChange={e => setProjStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">End Date</label>
                    <input className="input" type="date" value={projEndDate} onChange={e => setProjEndDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Est. Labor Hours</label>
                    <input className="input" type="number" value={projLaborHours || ''} onChange={e => setProjLaborHours(Number(e.target.value))} placeholder="0" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Measurements (maintenance only) */}
          {jobType === 'maintenance' && (
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Property Measurements</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Turf Area (sq ft)</label>
                  <input className="input" type="number" min="0" value={turfSF || ''} onChange={e => setTurfSF(Number(e.target.value))} placeholder="e.g. 15,000" />
                </div>
                <div>
                  <label className="label">Hard Surfaces (sq ft)</label>
                  <input className="input" type="number" min="0" value={hardscapeSF || ''} onChange={e => setHardscapeSF(Number(e.target.value))} placeholder="e.g. 8,000" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Line items auto-generate and refresh as you enter measurements.</p>
            </div>
          )}

          {/* Season & Visits — drives auto-generated line item quantities */}
          {jobType === 'maintenance' && (
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Season & Visits</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Visits per Month</label>
                  <select className="input" value={visitsPerMonth} onChange={e => setVisitsPerMonth(Number(e.target.value))}>
                    {[1,2,3,4,5,6,8].map(n => <option key={n} value={n}>{n} visits/mo</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Season Preset</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPreset('year')}
                      className={`text-xs px-2 py-1.5 rounded font-medium ${includeSnow && activeMonths.length === 7 ? 'bg-[#27AE60] text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                      Year-Round
                    </button>
                    <button type="button" onClick={() => setPreset('seasonal')}
                      className={`text-xs px-2 py-1.5 rounded font-medium ${!includeSnow && activeMonths.length === 7 ? 'bg-[#27AE60] text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                      Seasonal (7mo)
                    </button>
                    <button type="button" onClick={() => setPreset('summer')}
                      className={`text-xs px-2 py-1.5 rounded font-medium ${!includeSnow && activeMonths.length === 5 ? 'bg-[#27AE60] text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                      Summer (5mo)
                    </button>
                  </div>
                </div>
              </div>

              {/* Month grid — color-coded by service type */}
              {(() => {
                const SNOW_MOS = new Set<Month>(['nov','dec','jan','feb','mar']);
                return (
                  <>
                    <div className="flex gap-1.5 mb-2">
                      {MONTHS.map(m => {
                        const isMaint = activeMonths.includes(m);
                        const isSnow  = includeSnow && SNOW_MOS.has(m);
                        let cls = 'bg-gray-100 text-gray-400 border-gray-200';
                        if (isMaint && isSnow)  cls = 'bg-gradient-to-b from-green-500 to-blue-500 text-white border-transparent';
                        else if (isMaint)        cls = 'bg-[#27AE60] text-white border-transparent';
                        else if (isSnow)         cls = 'bg-blue-500 text-white border-transparent';
                        return (
                          <button key={m} type="button"
                            onClick={() => !SNOW_MOS.has(m) && toggleMonth(m)}
                            title={SNOW_MOS.has(m) ? (isSnow ? 'Snow month (toggle snow above)' : 'Snow month — off') : (isMaint ? 'Click to remove' : 'Click to add')}
                            className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all ${cls} ${SNOW_MOS.has(m) ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}>
                            {MONTH_LABELS[m][0]}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-gray-500 mb-1">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[#27AE60] inline-block" /> Maintenance (Apr–Oct)</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" /> Snow (Nov–Mar)</span>
                    </div>
                    {includeSnow && (
                      <p className="text-[10px] text-gray-400">Snow months are fixed Nov–Mar. Toggle snow removal above to include/exclude.</p>
                    )}
                    {!includeSnow && (
                      <p className="text-[10px] text-gray-400">Click maintenance months to toggle. Enable snow removal below to add Nov–Mar snow service.</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Snow removal — optional section on maintenance estimates */}
          {jobType === 'maintenance' && (
            <div className={`card transition-all ${includeSnow ? 'border-blue-200 bg-blue-50/30' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">❄</span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Snow Removal</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Add snow removal to this estimate</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500 font-medium">{includeSnow ? 'Included' : 'Not included'}</span>
                  <div
                    onClick={() => setIncludeSnow(v => !v)}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${includeSnow ? 'bg-blue-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeSnow ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>

              {includeSnow && (
                <div className="mt-4 pt-4 border-t border-blue-100 space-y-3">
                  <p className="text-xs text-gray-500">
                    Using property SF: <strong>{(turfSF + hardscapeSF).toLocaleString()} SF</strong> · Snow event history from Resources → Settings
                  </p>
                  <div className="flex gap-3">
                    <button type="button" onClick={addSnowPerTrip}
                      className="flex-1 py-2.5 px-4 rounded-lg border-2 border-blue-400 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                      + Add Per Trip
                    </button>
                    <button type="button" onClick={addSnowFlatRate}
                      className="flex-1 py-2.5 px-4 rounded-lg border-2 border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors">
                      + Add Flat Rate
                    </button>
                  </div>
                  {(() => {
                    const s = data.settings;
                    const totalSF = turfSF + hardscapeSF;
                    const events1_5 = s.snowEvents1_5in ?? 10;
                    const events4   = s.snowEvents4in   ?? 5;
                    const eff1_5    = s.snowEffSFPerHr1_5in ?? 44000;
                    const eff4      = s.snowEffSFPerHr4in   ?? 30000;
                    if (totalSF === 0) return <p className="text-xs text-amber-500 italic">Enter property SF above to calculate per-trip cost.</p>;
                    const seasonHrs = (totalSF / eff1_5) * events1_5 + (totalSF / eff4) * events4;
                    const totalEvents = events1_5 + events4;
                    const avgHrs = totalEvents > 0 ? seasonHrs / totalEvents : 0;
                    return (
                      <div className="text-xs text-gray-500 bg-blue-50 rounded-lg p-3 space-y-0.5">
                        <p className="font-medium text-blue-700 mb-1">Season Estimate Preview</p>
                        <p>{events1_5} light events + {events4} heavy events = <strong>{totalEvents} trips</strong></p>
                        <p>Avg {avgHrs.toFixed(1)} hrs/trip · {seasonHrs.toFixed(1)} hrs total season</p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Crew selector (maintenance only) */}
          {jobType === 'maintenance' && data.crews.length > 0 && (() => {
            const crew = data.crews.find(c => c.id === crewId);
            // Blended hourly rate = avg of crew members' totalCostHr
            const burden = 1 + (data.settings.payrollBurdenPercent ?? 13) / 100;
            const members = crew ? data.employees.filter(e => crew.memberIds.includes(e.id)) : [];
            const blendedRate = members.length > 0
              ? members.reduce((s, e) => s + e.hourlyRate * burden, 0) / members.length
              : 0;
            // Which contracts are already scheduled on that day?
            const dayConflicts = crewId && schedDay !== undefined
              ? data.contracts.filter(c => c.crewId === crewId && c.scheduledDay === schedDay && c.status !== 'closed' && c.id !== editingContract?.id)
              : [];

            return (
              <div className="card">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Crew Assignment</h3>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <label className="label">Assign Crew</label>
                    <select className="input" value={crewId} onChange={e => setCrewId(e.target.value)}>
                      <option value="">No crew assigned</option>
                      {data.crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {crew && (
                    <div className="bg-green-50 rounded-xl px-4 py-2 text-sm shrink-0">
                      <p className="text-xs text-gray-500 mb-0.5">Blended crew rate</p>
                      <p className="text-xl font-bold text-[#27AE60]">${blendedRate.toFixed(2)}/hr</p>
                      <p className="text-xs text-gray-400">{members.length} members · includes {data.settings.payrollBurdenPercent ?? 13}% burden</p>
                    </div>
                  )}
                </div>
                {dayConflicts.length > 0 && (
                  <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Crew already scheduled on {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][schedDay!]}:</p>
                    {dayConflicts.map(c => (
                      <p key={c.id} className="text-xs text-amber-600">{c.clientName} · {c.scheduledTime ?? '—'} ({c.scheduledDurationMinutes ?? 120}min)</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Line Items */}
          <div className="card p-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Line Items</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowCatalog(true)} className="btn-primary text-xs px-3 py-1.5">+ Add from Catalog</button>
                <button onClick={addBlank} className="btn-secondary text-xs px-3 py-1.5">+ Custom Item</button>
              </div>
            </div>

            {lineItems.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm mb-3">No line items yet.</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setShowCatalog(true)} className="btn-secondary text-sm">Browse Catalog</button>
                  <button onClick={addBlank} className="btn-secondary text-sm">Custom Item</button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Service / Description</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Qty</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Unit</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-blue-500">Est. Hrs</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-amber-600">Your Cost/Unit</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-700">Client Price/Unit</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Margin</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Options / Notes</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const maintItems = lineItems.filter(i => !isSnowItem(i));
                      const snowItems  = lineItems.filter(i => isSnowItem(i));
                      return (
                        <>
                          {maintItems.length > 0 && (
                            <tr className="bg-green-50/70"><td colSpan={9} className="px-3 py-1.5 text-[10px] font-bold text-[#27AE60] uppercase tracking-widest">🌿 Maintenance</td></tr>
                          )}
                          {maintItems.map(item => (
                            <LineItemRow key={item.id} item={item} onChange={u => updateItem(item.id, u)} onDelete={() => removeItem(item.id)} onRecalc={() => recalcLineItem(item)} targetMargin={data.settings.targetMargin} />
                          ))}
                          {snowItems.length > 0 && (
                            <tr className="bg-blue-50/70"><td colSpan={9} className="px-3 py-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-widest">❄ Snow Removal</td></tr>
                          )}
                          {snowItems.map(item => (
                            <LineItemRow key={item.id} item={item} onChange={u => updateItem(item.id, u)} onDelete={() => removeItem(item.id)} onRecalc={() => recalcLineItem(item)} targetMargin={data.settings.targetMargin} />
                          ))}
                        </>
                      );
                    })()}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totalHrs = lineItems.filter(i => !i.optional).reduce((s, i) => s + (i.estimatedHours ?? 0), 0);
                      return (
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td colSpan={3} className="px-3 py-3">
                            <button onClick={addBlank} className="text-xs text-[#27AE60] hover:underline font-medium">+ Add line item</button>
                            {lineItems.some(i => i.optional) && <span className="ml-3 text-xs text-gray-400">Optional items not included in totals</span>}
                          </td>
                          <td className="px-2 py-3 text-center text-xs font-semibold text-blue-600">
                            {totalHrs > 0 ? `${totalHrs.toFixed(1)} hrs/visit` : '—'}
                          </td>
                          <td className="px-2 py-3 text-right text-xs text-amber-600 font-semibold">{formatCurrency(totalCost)} cost</td>
                          <td className="px-2 py-3 text-right text-sm font-bold text-gray-900">{formatCurrency(subtotalRevenue)}</td>
                          <td className={`px-2 py-3 text-center text-sm font-bold ${overTarget ? 'text-green-600' : 'text-yellow-600'}`}>
                            {grossMargin > 0 ? formatPercent(grossMargin) : '—'}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Scheduling (maintenance only) ────────────────────────── */}
          {jobType === 'maintenance' && (() => {
            // scheduledDay: 0=Sun,1=Mon,...,6=Sat
            const DAY_ORDER = [1,2,3,4,5,6,0]; // Mon→Sun display order
            const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
            const scheduledContracts = data.contracts.filter(c => c.scheduledDay !== undefined && c.status !== 'closed');

            return (
              <div className="card">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Tentative Schedule</h3>
                <p className="text-xs text-gray-500 mb-3">Select a day to see what's already booked and lock in a time slot. This appears on the Schedule page immediately.</p>

                {/* Day availability grid */}
                <div className="grid grid-cols-7 gap-1.5 mb-4">
                  {DAY_ORDER.map((dow, i) => {
                    const jobsThisDay = scheduledContracts.filter(c => c.scheduledDay === dow);
                    const isSelected  = schedDay === dow;
                    const isBusy      = jobsThisDay.length >= 3;
                    const isMod       = jobsThisDay.length >= 1 && jobsThisDay.length < 3;

                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() => setSchedDay(isSelected ? undefined : dow)}
                        className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all text-xs ${
                          isSelected
                            ? 'border-[#27AE60] bg-green-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <span className={`font-bold ${isSelected ? 'text-[#27AE60]' : 'text-gray-700'}`}>{DAY_NAMES[i]}</span>
                        <span className={`mt-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isBusy ? 'bg-red-100 text-red-700' : isMod ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {jobsThisDay.length}
                        </span>
                        <span className={`text-[9px] mt-0.5 ${isBusy ? 'text-red-500' : isMod ? 'text-amber-500' : 'text-green-600'}`}>
                          {isBusy ? 'busy' : isMod ? 'open' : 'free'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected day detail */}
                {schedDay !== undefined && (() => {
                  const dayJobs = scheduledContracts.filter(c => c.scheduledDay === schedDay);
                  return (
                    <div className="bg-gray-50 rounded-xl p-3 mb-4">
                      <p className="text-xs font-semibold text-gray-600 mb-2">
                        Currently scheduled on {DAY_NAMES[DAY_ORDER.indexOf(schedDay)]}:
                      </p>
                      {dayJobs.length === 0 ? (
                        <p className="text-xs text-green-600">Nothing booked — wide open.</p>
                      ) : (
                        <div className="space-y-1">
                          {dayJobs.map(c => (
                            <div key={c.id} className="flex items-center justify-between text-xs">
                              <span className={`font-medium ${c.status === 'active' ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                                {c.clientName}
                              </span>
                              <span className="text-gray-400">
                                {c.scheduledTime ?? '—'} · {c.scheduledDurationMinutes ?? 120}min
                                {c.status === 'estimate' ? ' (tentative)' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Time + duration pickers */}
                {schedDay !== undefined && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label">Start Time</label>
                      <input className="input" type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Duration (min)</label>
                      <input className="input" type="number" step="15" min="15" value={schedDuration} onChange={e => setSchedDuration(Number(e.target.value))} />
                    </div>
                    <div className="flex items-end">
                      <button type="button" onClick={() => setSchedDay(undefined)} className="btn-secondary text-xs w-full">
                        Clear Schedule
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Quote Totals ────────────────────────────────────────── */}
          {lineItems.length > 0 && (() => {
            const s = data.settings;
            const activeItems        = lineItems.filter(i => !i.optional);
            // recurringMaintRev = sum of qty×unitPrice for non-snow recurring items
            // qty is already set to visitsPerMonth when added from catalog, so this = monthly revenue
            const recurringMaintRev  = activeItems.filter(i => !isSnowItem(i) && !i.isOneTime).reduce((s, i) => s + i.qty * i.unitPrice, 0);
            // Snow flat: qty=5 months × monthly rate = seasonal total
            const snowFlatRev        = activeItems.filter(i => isSnowItem(i) && !i.isSnowPerTrip).reduce((s, i) => s + i.qty * i.unitPrice, 0);
            const snowPerTripItems   = activeItems.filter(i => i.isSnowPerTrip === true);
            const snowPerTripRev     = snowPerTripItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
            const snowPerTripCost    = snowPerTripItems.reduce((s, i) => s + i.qty * i.unitCost, 0);
            const oneTimeRev         = activeItems.filter(i => !isSnowItem(i) && i.isOneTime).reduce((s, i) => s + i.qty * i.unitPrice, 0);

            // ── Drive time ─────────────────────────────────────────────────
            const driveHrsRT    = milesFromShop > 0 ? (milesFromShop / (s.averageSpeedMph || 30)) * 2 : 0;
            const driveLaborCost = parseFloat((driveHrsRT * getBlendedRate()).toFixed(2));
            const driveGallons   = milesFromShop > 0 ? (milesFromShop / (s.vehicleMpg || 12)) * 2 : 0;
            const driveFuelCost  = parseFloat((driveGallons * (s.fuelCostPerGallon || 3.50)).toFixed(2));
            // Drive cost per active month, multiplied across the season
            const driveCostPerMonth = driveLaborCost + driveFuelCost;
            // Annual drive cost: (maintenance months + snow months if included)
            const totalActiveMonths = activeMonths.length + (snowFlatRev > 0 ? 5 : 0);
            const annualDriveCost   = parseFloat((driveCostPerMonth * (jobType === 'maintenance' ? totalActiveMonths : 1)).toFixed(2));
            // Drive revenue: mark up by target margin
            const marginPct = s.targetMargin / 100;
            const driveCharge = annualDriveCost > 0 && marginPct < 1
              ? parseFloat((annualDriveCost / (1 - marginPct)).toFixed(2))
              : annualDriveCost;

            // Annual value excludes per-trip snow (shown separately as projection)
            const annualValue    = jobType === 'maintenance'
              ? recurringMaintRev * activeMonths.length + snowFlatRev + oneTimeRev + driveCharge
              : subtotalRevenue + driveCharge;
            const taxableAnnual  = activeItems.filter(i => i.taxable && !i.isSnowPerTrip).reduce((sum, i) => {
              if (isSnowItem(i) || i.isOneTime) return sum + i.qty * i.unitPrice;
              return sum + i.qty * i.unitPrice * activeMonths.length;
            }, 0);
            const ovhdAmt        = parseFloat(((annualValue) * additionalOverhead / 100).toFixed(2));
            const subtotalWithOvhd = annualValue + ovhdAmt;
            const afterDiscount  = Math.max(subtotalWithOvhd - discountAmount, 0);
            const taxAmt         = parseFloat((taxableAnnual * taxRate / 100).toFixed(2));
            const totalDue       = afterDiscount + taxAmt;
            const balanceDue     = Math.max(totalDue - downPaymentReq, 0);
            const monthlyBilling = recurringMaintRev;
            return (
              <div className="card">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Quote Totals</h3>
                <div className="space-y-0 text-sm">

                  {/* Annual value */}
                  <div className="flex justify-between py-2.5 border-b border-gray-100">
                    <div>
                      <span className="text-gray-600">{jobType === 'maintenance' ? 'Annual Value' : 'Project Total'}</span>
                      {jobType === 'maintenance' && (
                        <div className="flex gap-3 mt-0.5 flex-wrap">
                          {recurringMaintRev > 0 && <span className="text-[10px] text-green-600">{formatCurrency(recurringMaintRev)}/mo × {activeMonths.length}mo</span>}
                          {snowFlatRev > 0 && <span className="text-[10px] text-blue-500">+ {formatCurrency(snowFlatRev)} snow flat</span>}
                          {oneTimeRev > 0 && <span className="text-[10px] text-amber-500">+ {formatCurrency(oneTimeRev)} one-time</span>}
                          {driveCharge > 0 && <span className="text-[10px] text-indigo-500">+ {formatCurrency(driveCharge)} drive</span>}
                        </div>
                      )}
                    </div>
                    <span className="font-semibold text-gray-900">{formatCurrency(annualValue)}</span>
                  </div>

                  {/* Drive Time (shown if miles entered) */}
                  {milesFromShop > 0 && (
                    <div className="py-2.5 border-b border-gray-100 bg-indigo-50/40 px-2 rounded-lg my-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-gray-700 font-medium text-sm">🚗 Drive Time — included above</span>
                          <div className="text-[10px] text-gray-500 mt-0.5 space-y-0.5">
                            <p>{milesFromShop} mi × 2 = {(milesFromShop * 2).toFixed(1)} mi round trip · {driveHrsRT.toFixed(2)} hrs</p>
                            <p>Labor: {formatCurrency(driveLaborCost)} · Fuel: {driveGallons.toFixed(1)} gal × {formatCurrency(s.fuelCostPerGallon || 3.50)} = {formatCurrency(driveFuelCost)}</p>
                            <p>Cost/visit: {formatCurrency(driveCostPerMonth)} · Season ({totalActiveMonths}mo) charge: {formatCurrency(driveCharge)}</p>
                          </div>
                        </div>
                        <span className="text-indigo-700 font-semibold text-sm">{formatCurrency(driveCharge)}</span>
                      </div>
                    </div>
                  )}

                  {/* Additional Overhead */}
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-gray-600 flex items-center gap-2">
                      Additional Overhead
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="0" max="50" step="0.5"
                          className="w-14 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#27AE60]"
                          value={additionalOverhead || ''}
                          onChange={e => setAdditionalOverhead(parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                    </span>
                    <span className={`font-medium ${ovhdAmt > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                      {ovhdAmt > 0 ? `+${formatCurrency(ovhdAmt)}` : '—'}
                    </span>
                  </div>

                  {/* Discount */}
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-gray-600">Discount</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-sm">-$</span>
                      <input
                        type="number" min="0" step="5"
                        className="w-24 text-sm text-right border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-[#27AE60]"
                        value={discountAmount || ''}
                        onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Sales Tax */}
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-gray-600 flex items-center gap-2">
                      Sales Tax
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="0" max="20" step="0.25"
                          className="w-14 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#27AE60]"
                          value={taxRate || ''}
                          onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                      {taxRate > 0 && taxableAnnual === 0 && <span className="text-[10px] text-amber-500 italic">mark items taxable ↑</span>}
                    </span>
                    <span className={`font-medium ${taxAmt > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                      {taxAmt > 0 ? `+${formatCurrency(taxAmt)}` : '—'}
                    </span>
                  </div>

                  {/* Total Due */}
                  <div className="flex justify-between py-3 border-b-2 border-gray-300 font-bold text-base">
                    <span className="text-gray-900">Total Due</span>
                    <span className="text-gray-900">{formatCurrency(totalDue)}</span>
                  </div>

                  {/* Down Payment */}
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-gray-600">Down Payment Required</span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="50"
                        className="w-24 text-sm text-right border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-[#27AE60]"
                        value={downPaymentReq || ''}
                        onChange={e => setDownPaymentReq(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Balance Due */}
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-gray-700 font-semibold">Balance Due at Completion</span>
                    <span className="font-bold text-gray-800">{formatCurrency(balanceDue)}</span>
                  </div>

                  {/* Monthly billing rate — bold, green highlight */}
                  {jobType === 'maintenance' && monthlyBilling > 0 && (
                    <div className="flex justify-between items-center mt-2 pt-3 border-t-2 border-[#27AE60]">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">Monthly Billing Rate</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Recurring maintenance · {activeMonths.length} active months</p>
                      </div>
                      <span className="text-2xl font-bold text-[#27AE60]">{formatCurrency(monthlyBilling)}<span className="text-sm font-normal text-gray-400">/mo</span></span>
                    </div>
                  )}

                  {/* Per-trip snow projection (not included in annual value) */}
                  {snowPerTripRev > 0 && (
                    <div className="mt-4 pt-4 border-t-2 border-blue-200 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-500">❄ Per-Trip Snow Projection</p>
                      <p className="text-[11px] text-gray-400 italic">Not included in annual value — billed per event</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Expected Season Cost</span>
                        <span className="font-medium text-gray-700">{formatCurrency(snowPerTripCost)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Projected Season Revenue</span>
                        <span className="font-semibold text-blue-700">{formatCurrency(snowPerTripRev)}</span>
                      </div>
                      {snowPerTripRev > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Est. Snow Margin</span>
                          <span className="font-medium text-blue-600">{formatPercent(((snowPerTripRev - snowPerTripCost) / snowPerTripRev) * 100)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {jobType === 'maintenance' ? (
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Contract Terms & Notes</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Notes (internal)</label>
                  <textarea className="input resize-none" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes, scope, exclusions..." />
                </div>
                <div>
                  <label className="label">Payment Terms (on invoice)</label>
                  <textarea className="input resize-none" rows={3} value={terms} onChange={e => setTerms(e.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Notes & Terms</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Notes (internal)</label>
                  <textarea className="input resize-none" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Scope details, exclusions, site conditions..." />
                </div>
                <div>
                  <label className="label">Payment Terms</label>
                  <textarea className="input resize-none" rows={3} value={terms} onChange={e => setTerms(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Summary ─────────────────────────────────────────────── */}
        <div className="col-span-2">
          <div className="sticky top-6 space-y-4">
            <div className={`card border-2 ${overTarget ? 'border-green-300' : 'border-yellow-300'}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Quote Summary</h3>

              {(() => {
                const totalHrs = lineItems.filter(i => !i.optional).reduce((s, i) => s + (i.estimatedHours ?? 0), 0);
                return (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Line items</span>
                      <span>{lineItems.filter(i => !i.optional).length} active</span>
                    </div>
                    {totalHrs > 0 && (
                      <div className="flex justify-between text-blue-600">
                        <span>Est. hrs/visit</span>
                        <span className="font-semibold">{totalHrs.toFixed(1)} hrs</span>
                      </div>
                    )}
                    <div className="flex justify-between text-amber-600">
                      <span>Your total cost</span>
                      <span className="font-semibold">{formatCurrency(totalCost)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Gross profit</span>
                      <span className={`font-semibold ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(grossProfit)}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="mt-4 pt-4 border-t border-gray-100">
                {jobType === 'maintenance' ? (() => {
                  const maintItems = lineItems.filter(i => !isSnowItem(i));
                  const snowItems  = lineItems.filter(i => isSnowItem(i));
                  const maintRev   = maintItems.filter(i => !i.optional).reduce((s, i) => s + i.qty * i.unitPrice, 0);
                  const snowFlatItems = snowItems.filter(i => !i.optional && !i.isSnowPerTrip);
                  const snowPerTripSummaryItems = snowItems.filter(i => !i.optional && i.isSnowPerTrip === true);
                  const snowRev    = snowItems.filter(i => !i.optional).reduce((s, i) => s + i.qty * i.unitPrice, 0);
                  const snowFlatRevSummary  = snowFlatItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
                  const snowPerTripRevSummary = snowPerTripSummaryItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
                  // Snow annual: flat-rate items × months; per-trip = projected season total (not included in annual)
                  const snowAnnual = snowFlatRevSummary;
                  return (
                    <>
                      {/* Maintenance block */}
                      {(() => {
                        const recurringMaint = maintItems.filter(i => !i.optional && !i.isOneTime);
                        const oneTimeMaint   = maintItems.filter(i => !i.optional && i.isOneTime);
                        const recurringRev   = recurringMaint.reduce((s, i) => s + i.qty * i.unitPrice, 0);
                        const oneTimeRev     = oneTimeMaint.reduce((s, i) => s + i.qty * i.unitPrice, 0);
                        return (
                          <div className="mb-3 p-3 bg-green-50 rounded-xl border border-green-100">
                            <p className="text-[10px] font-bold text-[#27AE60] uppercase tracking-wider mb-2">🌿 Maintenance</p>
                            {recurringRev > 0 ? (
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between text-gray-500">
                                  <span>Per visit</span>
                                  <span className="font-semibold text-gray-800">{formatCurrency(recurringRev / visitsPerMonth)}</span>
                                </div>
                                <div className="flex justify-between text-gray-400">
                                  <span>{visitsPerMonth} visits/mo</span>
                                  <span />
                                </div>
                                <div className="flex justify-between font-bold text-sm text-gray-900 pt-1 border-t border-green-100">
                                  <span>Monthly</span>
                                  <span>{formatCurrency(recurringRev)}</span>
                                </div>
                                <div className="flex justify-between text-gray-400 text-xs">
                                  <span>{activeMonths.length} maint. months (Apr–Oct)</span>
                                  <span className="text-[#27AE60] font-semibold">{formatCurrency(recurringRev * activeMonths.length)}/yr</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">Enter SF above to generate</p>
                            )}
                            {oneTimeRev > 0 && (
                              <div className="mt-2 pt-2 border-t border-green-100 flex justify-between text-xs text-amber-600 font-medium">
                                <span>+ One-time charges</span>
                                <span>{formatCurrency(oneTimeRev)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Snow block */}
                      {includeSnow && (
                        <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">❄ Snow Removal</p>
                          {snowRev > 0 ? (
                            <div className="space-y-1 text-xs">
                              {snowPerTripRevSummary > 0 && (
                                <>
                                  <div className="flex justify-between text-gray-500">
                                    <span>Per trip (projected)</span>
                                    <span className="font-semibold text-gray-800">{formatCurrency(snowPerTripRevSummary)}</span>
                                  </div>
                                  <div className="flex justify-between text-blue-400 text-xs">
                                    <span>Billed per event · not in annual</span>
                                    <span />
                                  </div>
                                </>
                              )}
                              {snowFlatRevSummary > 0 && (
                                <>
                                  <div className="flex justify-between font-bold text-sm text-gray-900">
                                    <span>Flat rate</span>
                                    <span>{formatCurrency(snowFlatRevSummary)}</span>
                                  </div>
                                  <div className="flex justify-between text-blue-400 text-xs">
                                    <span>Included in annual value</span>
                                    <span className="text-blue-600 font-semibold">{formatCurrency(snowAnnual)}/season</span>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">Add a snow line item above</p>
                          )}
                        </div>
                      )}

                      {/* Combined totals — color-coded calendar bar */}
                      {(() => {
                        const SNOW_MOS = new Set<Month>(['nov','dec','jan','feb','mar']);
                        return (
                          <div className="flex gap-0.5 mb-1 mt-3">
                            {MONTHS.map(m => {
                              const isMaint = activeMonths.includes(m);
                              const isSnow  = includeSnow && SNOW_MOS.has(m);
                              let barCls = 'bg-gray-200';
                              if (isMaint && isSnow)  barCls = 'bg-gradient-to-b from-[#27AE60] to-blue-500';
                              else if (isMaint)        barCls = 'bg-[#27AE60]';
                              else if (isSnow)         barCls = 'bg-blue-500';
                              return (
                                <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
                                  <div className={`w-full h-3 rounded-sm ${barCls}`} />
                                  <span className="text-[8px] uppercase text-gray-400 leading-none">{m[0]}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                        <div>
                          <span className="text-xs text-gray-500 font-medium">Total Annual</span>
                          <div className="flex gap-3 mt-0.5">
                            <span className="text-[10px] text-green-600">🌿 {activeMonths.length}mo maint.</span>
                            {includeSnow && <span className="text-[10px] text-blue-500">❄ 5mo snow</span>}
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(maintRev * activeMonths.length + snowAnnual)}
                        </span>
                      </div>
                    </>
                  );
                })() : (
                  <>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm text-gray-600 font-medium">Project Total</span>
                      <span className="text-2xl font-bold text-gray-900">{formatCurrency(subtotalRevenue)}</span>
                    </div>
                    {data.settings.defaultTaxRate > 0 && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Tax ({data.settings.defaultTaxRate}%)</span>
                        <span>{formatCurrency(subtotalRevenue * data.settings.defaultTaxRate / 100)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className={`mt-4 p-3 rounded-xl ${overTarget ? 'bg-green-50' : 'bg-yellow-50'}`}>
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-gray-600">Gross Margin</span>
                  <span className={`text-xl font-bold ${overTarget ? 'text-green-700' : 'text-yellow-700'}`}>
                    {grossMargin > 0 ? formatPercent(grossMargin) : '—'}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${overTarget ? 'bg-green-500' : 'bg-yellow-500'}`}
                    style={{ width: `${Math.min(Math.max(grossMargin, 0), 100)}%` }} />
                </div>
                <p className="text-xs mt-1 text-gray-500">Target: {data.settings.targetMargin}%</p>
              </div>
            </div>

            {lineItems.length > 0 && (
              <div className="card text-xs space-y-1 text-gray-500">
                <p className="font-semibold text-gray-600 mb-2">Item Margin Colors</p>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Above target ({data.settings.targetMargin}%+)</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Near target</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Below target</div>
                <p className="text-gray-400 pt-1">Amber column = your cost (not shown to client)</p>
              </div>
            )}

            <div className="space-y-2">
              {jobType === 'maintenance' ? (
                <>
                  <button className="btn-primary w-full py-2.5" onClick={() => saveContract('estimate')}>Save as Estimate</button>
                  <button className="btn-secondary w-full py-2.5" onClick={() => saveContract('active')}>Save as Active Contract</button>
                </>
              ) : (
                <>
                  <button className="btn-primary w-full py-2.5" onClick={() => saveProject('estimate')}>Save as Estimate</button>
                  <button className="btn-secondary w-full py-2.5" onClick={() => saveProject('approved')}>Save as Active Project</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCatalog && (
        <CatalogPicker catalog={data.serviceCatalog} onSelect={addFromCatalog} onClose={() => setShowCatalog(false)} />
      )}
    </div>
  );
}
