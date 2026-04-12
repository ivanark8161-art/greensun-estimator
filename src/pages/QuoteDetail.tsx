import { useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  AppData, EstimateLineItem, PropertyType, Month, Contract,
  ContractStatus, ServiceCatalogItem, AccountingCodeBucket, JobCostingCodes, Job,
} from '../types';
import { MONTHS, MONTH_LABELS, calcLineItemTotals, lineItemMargin } from '../types';
import { formatCurrency, formatPercent, generateEstimateNumber } from '../utils/calculations';
import { saveData } from '../utils/storage';
import Modal from '../components/Modal';
import QuotePDFButton from '../components/QuotePDF';

interface Props { data: AppData; setData: (d: AppData) => void }

function uid() { return `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function cid() { return `c_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`; }

// ─── Quote statuses ──────────────────────────────────────────────────────────
const QUOTE_STATUS_OPTIONS: { value: ContractStatus; label: string }[] = [
  { value: 'draft',             label: 'Draft' },
  { value: 'awaiting_response', label: 'Awaiting Response' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'approved',          label: 'Approved' },
  { value: 'converted',         label: 'Converted to Job' },
  { value: 'rejected',          label: 'Rejected' },
];

const STATUS_COLOR: Record<string, string> = {
  draft:             'bg-gray-100 text-gray-600',
  estimate:          'bg-gray-100 text-gray-600',
  awaiting_response: 'bg-yellow-100 text-yellow-700',
  changes_requested: 'bg-orange-100 text-orange-700',
  approved:          'bg-green-100 text-green-700',
  converted:         'bg-blue-100 text-blue-700',
  rejected:          'bg-red-100 text-red-600',
};

// ─── Snow classifier ─────────────────────────────────────────────────────────
const SNOW_IDS = new Set(['svc16','svc17','svc18','svc19','svc20','snow_trip']);
function isSnowItem(i: EstimateLineItem) {
  return SNOW_IDS.has(i.catalogItemId ?? '') || i.isSnowPerTrip === true;
}

// ─── Line Item Row ───────────────────────────────────────────────────────────
interface RowProps {
  item: EstimateLineItem;
  onChange: (u: Partial<EstimateLineItem>) => void;
  onDelete: () => void;
  onRecalc?: () => void;
  targetMargin: number;
}
function LineItemRow({ item, onChange, onDelete, onRecalc, targetMargin }: RowProps) {
  const margin   = lineItemMargin(item);
  const subtotal = item.qty * item.unitPrice;
  const costTotal = item.qty * item.unitCost;
  const over      = margin >= targetMargin;
  const near      = margin >= targetMargin * 0.8;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50 group">
      <td className="px-3 py-2 min-w-[180px]">
        <input
          className="w-full text-sm font-medium text-gray-900 bg-transparent border-0 border-b border-transparent focus:border-[#27AE60] focus:outline-none px-0 py-0.5"
          value={item.name} onChange={e => onChange({ name: e.target.value })} placeholder="Service name"
        />
        <input
          className="w-full text-xs text-gray-400 bg-transparent border-0 border-b border-transparent focus:border-gray-300 focus:outline-none px-0 py-0.5 mt-0.5"
          value={item.description} onChange={e => onChange({ description: e.target.value })} placeholder="Description"
        />
      </td>
      <td className="px-2 py-2 w-16">
        <input type="number" min="0" step="0.5" className="w-full text-sm text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
          value={item.qty || ''} onChange={e => onChange({ qty: parseFloat(e.target.value) || 0 })} />
      </td>
      <td className="px-2 py-2 w-20">
        <input className="w-full text-sm text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
          value={item.unit} onChange={e => onChange({ unit: e.target.value })} placeholder="unit" />
      </td>
      <td className="px-2 py-2 w-20">
        <input type="number" min="0" step="0.25" className="w-full text-sm text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
          value={item.estimatedHours ?? ''} onChange={e => onChange({ estimatedHours: parseFloat(e.target.value) || 0 })} placeholder="0" />
        <p className="text-[10px] text-center text-gray-400 mt-0.5">hrs</p>
      </td>
      <td className="px-2 py-2 w-28">
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-sm">$</span>
          <input type="number" min="0" step="0.01" className="w-full text-sm text-gray-500 border border-gray-200 rounded px-1 py-1 focus:outline-none focus:border-amber-400 bg-amber-50/30"
            value={item.unitCost || ''} onChange={e => onChange({ unitCost: parseFloat(e.target.value) || 0 })} title="Your cost" />
        </div>
        <p className="text-xs text-gray-400 text-center mt-0.5">{formatCurrency(costTotal)}</p>
      </td>
      <td className="px-2 py-2 w-32">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onChange({ unitPrice: Math.max(0, parseFloat((item.unitPrice - 5).toFixed(2))) })}
            className="text-gray-400 hover:text-red-500 font-bold text-base w-5 h-7 flex items-center justify-center rounded hover:bg-gray-100"
            title="-$5">▾</button>
          <span className="text-gray-600 text-sm">$</span>
          <input type="number" min="0" step="0.01" className="w-full text-sm font-semibold text-gray-900 border border-gray-300 rounded px-1 py-1 focus:outline-none focus:border-[#27AE60]"
            value={item.unitPrice || ''} onChange={e => onChange({ unitPrice: parseFloat(e.target.value) || 0 })} title="Client price" />
          <button
            type="button"
            onClick={() => onChange({ unitPrice: parseFloat((item.unitPrice + 5).toFixed(2)) })}
            className="text-gray-400 hover:text-green-600 font-bold text-base w-5 h-7 flex items-center justify-center rounded hover:bg-gray-100"
            title="+$5">▴</button>
        </div>
        <p className="text-xs text-gray-500 text-center mt-0.5 font-medium">{formatCurrency(subtotal)}</p>
      </td>
      <td className="px-2 py-2 w-20 text-center">
        <span className={`text-sm font-bold ${over ? 'text-green-600' : near ? 'text-yellow-600' : 'text-red-500'}`}>
          {item.unitPrice > 0 ? formatPercent(margin) : '—'}
        </span>
      </td>
      <td className="px-2 py-2 w-36">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-500">
            <input type="checkbox" checked={item.optional} onChange={e => onChange({ optional: e.target.checked })} className="accent-gray-400 w-3 h-3" /> Optional
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-xs text-amber-600">
            <input type="checkbox" checked={item.isOneTime ?? false} onChange={e => onChange({ isOneTime: e.target.checked })} className="accent-amber-500 w-3 h-3" /> One-time
          </label>
          <label className="flex items-center gap-1 cursor-pointer text-xs text-blue-500">
            <input type="checkbox" checked={item.taxable} onChange={e => onChange({ taxable: e.target.checked })} className="accent-blue-500 w-3 h-3" /> Taxable
          </label>
        </div>
      </td>
      <td className="px-2 py-2 w-10">
        <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRecalc && item.catalogItemId && (
            <button onClick={onRecalc} title="Recalculate from SF" className="text-blue-400 hover:text-blue-600 text-sm">↺</button>
          )}
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500 text-lg leading-none">✕</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Catalog Picker ──────────────────────────────────────────────────────────
function CatalogPicker({ catalog, onSelect, onClose }: { catalog: ServiceCatalogItem[]; onSelect: (i: ServiceCatalogItem) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
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
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {filtered.map(item => (
            <button key={item.id} onClick={() => { onSelect(item); onClose(); }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 text-left transition-colors border border-transparent hover:border-gray-200">
              <div>
                <p className="font-medium text-sm text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-400">{item.description}</p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="text-xs text-amber-600">{formatCurrency(item.defaultUnitCost)}/{item.unit} cost</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.defaultUnitPrice)}/{item.unit}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center py-6 text-sm text-gray-400">No services match your search</p>}
        </div>
      </div>
    </Modal>
  );
}

// ─── Main QuoteDetail Component ───────────────────────────────────────────────
export default function QuoteDetail({ data, setData }: Props) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isNew     = id === undefined;
  const existing  = isNew ? null : data.contracts.find(c => c.id === id) ?? null;
  const fromReqId    = searchParams.get('requestId');
  const fromReq      = fromReqId ? data.requests?.find(r => r.id === fromReqId) : null;
  const fromClientId = searchParams.get('clientId');
  const fromClient   = fromClientId ? data.clients.find(c => c.id === fromClientId) : null;
  const fromClientContact = fromClient ? (fromClient.contacts?.find(ct => ct.isPrimary) ?? fromClient.contacts?.[0]) : null;
  const fromClientProp    = fromClient ? (fromClient.properties?.find(p => p.isBillingAddress) ?? fromClient.properties?.[0]) : null;

  // ── Form state (pre-filled from existing contract, request, or client) ──────
  const [quoteId]       = useState(existing?.id ?? cid());
  const [status, setStatus] = useState<ContractStatus>(existing?.status ?? 'draft');
  const [title, setTitle]   = useState(existing?.title ?? fromReq?.title ?? '');
  const [jobType, setJobType] = useState<'maintenance' | 'landscaping'>('maintenance');

  const [clientName,    setClientName]    = useState(existing?.clientName    ?? fromReq?.clientName    ?? fromClient?.companyName ?? fromClient?.name ?? '');
  const [clientId,      setClientId]      = useState(existing?.clientId      ?? fromReq?.clientId      ?? fromClientId ?? '');
  const [propertyType,  setPropertyType]  = useState<PropertyType>(existing?.propertyType ?? fromReq?.propertyType ?? fromClient?.type ?? 'commercial');
  const [address,       setAddress]       = useState(existing?.address       ?? fromReq?.propertyAddress ?? fromClientProp?.street1 ?? '');
  const [city,          setCity]          = useState(existing?.city          ?? fromReq?.city          ?? fromClientProp?.city ?? '');
  const [state,         setState_]        = useState(existing?.state         ?? fromReq?.state         ?? fromClientProp?.state ?? '');
  const [zip,           setZip]           = useState(existing?.zip           ?? fromReq?.zip           ?? fromClientProp?.zip ?? '');
  const [clientEmail,   setClientEmail]   = useState(existing?.clientEmail   ?? fromReq?.email         ?? fromClientContact?.email ?? '');
  const [milesFromShop, setMilesFromShop] = useState(existing?.milesFromShop ?? 0);

  const [turfSF,      setTurfSF]      = useState(existing?.turfSF      ?? fromReq?.turfSF      ?? 0);
  const [hardscapeSF, setHardscapeSF] = useState(existing?.hardscapeSF ?? fromReq?.hardscapeSF ?? 0);
  const [visitsPerMonth, setVisitsPerMonth] = useState(existing?.visitsPerMonth ?? 4);
  const [activeMonths,   setActiveMonths]   = useState<Month[]>(existing?.activeMonths ?? ['apr','may','jun','jul','aug','sep','oct']);
  const [includeSnow,    setIncludeSnow]    = useState(false);
  const [crewId,         setCrewId]         = useState(existing?.crewId ?? '');

  const [lineItems, setLineItems] = useState<EstimateLineItem[]>(existing?.lineItems ?? []);
  const [taxRate,        setTaxRate]        = useState(existing?.taxRate            ?? 0);
  const [taxRateId,      setTaxRateId]      = useState(existing?.taxRateId          ?? '');
  const [discountAmount,   setDiscountAmount]   = useState(existing?.discountAmount      ?? 0);
  const [downPaymentReq,   setDownPaymentReq]   = useState(existing?.downPaymentRequired  ?? 0);
  const [overheadPct,    setOverheadPct]    = useState(existing?.additionalOverheadPct ?? 0);
  const [consumablesPct, setConsumablesPct] = useState(existing?.consumablesPct ?? 0);
  const [notes, setNotes]   = useState(existing?.notes ?? (fromReq ? `From Request #${fromReq.requestNumber}. ${fromReq.serviceDetails}`.trim() : ''));
  const [terms, setTerms]   = useState(existing?.terms ?? 'Net 30. Late payment: 1.5%/month (18% annual).');

  const [showCatalog, setShowCatalog] = useState(false);
  const [saved, setSaved]             = useState(false);

  const SNOW_MOS = new Set<Month>(['nov','dec','jan','feb','mar']);

  // ── Derived totals ────────────────────────────────────────────────────────
  const { subtotalRevenue, totalCost, grossMargin } = calcLineItemTotals(lineItems);

  // ── Crew / blended rate ───────────────────────────────────────────────────
  function getBlendedRate(): number {
    const burden = 1 + (data.settings.payrollBurdenPercent ?? 13) / 100;
    const crew = crewId ? data.crews.find(c => c.id === crewId) : null;
    if (crew && crew.memberIds.length > 0) {
      return data.employees.filter(e => crew.memberIds.includes(e.id)).reduce((s, e) => s + e.hourlyRate * burden, 0);
    }
    const crewRates = data.crews.filter(c => c.memberIds.length > 0).map(c =>
      data.employees.filter(e => c.memberIds.includes(e.id)).reduce((s, e) => s + e.hourlyRate * burden, 0)
    );
    return crewRates.length > 0 ? crewRates.reduce((s, r) => s + r, 0) / crewRates.length : (data.settings.laborRatePerHour ?? 22) * burden;
  }

  // ── SF-based cost calc ────────────────────────────────────────────────────
  function calcFromSF(svc: ServiceCatalogItem) {
    const s = data.settings;
    const sfPerHour = svc.estimatedHours > 0 ? 1000 / svc.estimatedHours : 0;
    const hours = sfPerHour > 0 && turfSF > 0 ? parseFloat((turfSF / sfPerHour).toFixed(2)) : 0;
    const eqCostPerVisit = data.equipment.filter(e => (svc.equipmentIds ?? []).includes(e.id))
      .reduce((sum, e) => sum + (e.paymentType === 'monthly_payment' ? e.monthlyPaymentAmount : e.monthlyDepreciation) / (visitsPerMonth || 4), 0);
    const rawCost = hours > 0 ? hours * getBlendedRate() + eqCostPerVisit : 0;
    const consumables = (s.consumablesPercent ?? 3) / 100;
    const ovhd = (s.overheadMarkupPercent ?? 3) / 100;
    const markedUpCost = rawCost > 0 ? rawCost * (1 + consumables) * (1 + ovhd) : 0;
    const marginPct = (svc.targetMargin ?? s.targetMargin) / 100;
    const unitCost  = parseFloat((markedUpCost || svc.defaultUnitCost).toFixed(2));
    const unitPrice = markedUpCost > 0 && marginPct < 1 ? parseFloat((markedUpCost / (1 - marginPct)).toFixed(2)) : svc.defaultUnitPrice;
    return { hours, unitCost, unitPrice };
  }

  function addFromCatalog(svc: ServiceCatalogItem) {
    const isMonthlyUnit = svc.unit === 'month';
    const isSnow = svc.category === 'snow';
    const { hours, unitCost, unitPrice } = jobType === 'maintenance' && turfSF > 0 ? calcFromSF(svc) : { hours: svc.estimatedHours, unitCost: svc.defaultUnitCost, unitPrice: svc.defaultUnitPrice };
    const qty = (jobType === 'maintenance' && !isSnow && !isMonthlyUnit) ? visitsPerMonth : 1;
    setLineItems(prev => [...prev, {
      id: uid(), catalogItemId: svc.id, name: svc.name, description: svc.description,
      qty, unit: svc.unit, unitCost, unitPrice, estimatedHours: hours,
      optional: false, taxable: svc.taxable, notes: '',
    }]);
  }

  function calcSnowFlatRateMonthly() {
    const st = data.settings;
    const totalSF = turfSF + hardscapeSF;
    if (totalSF === 0) return null;
    const eff1_5     = st.snowEffSFPerHr1_5in ?? 44000;
    const eff4       = st.snowEffSFPerHr4in   ?? 30000;
    const events1_5  = st.snowEvents1_5in ?? 10;
    const events4    = st.snowEvents4in   ?? 5;
    // Hours per month = SF / efficiency × events per month (season ÷ 5 months)
    const monthlyHrs = (totalSF / eff1_5) * (events1_5 / 5) + (totalSF / eff4) * (events4 / 5);
    const rawCost    = monthlyHrs * (st.plowingCostPerHour ?? 65);
    const unitCost   = parseFloat(rawCost.toFixed(2));
    const unitPrice  = parseFloat((rawCost / (1 - (st.targetMargin ?? 40) / 100)).toFixed(2));
    return { estimatedHours: parseFloat(monthlyHrs.toFixed(2)), unitCost, unitPrice };
  }

  function addSnowFlatRate() {
    if (lineItems.find(i => i.catalogItemId === 'svc20')) return;
    const svc = data.serviceCatalog.find(s => s.id === 'svc20');
    const sfCalc = calcSnowFlatRateMonthly();
    setLineItems(prev => [...prev, {
      id: uid(), catalogItemId: 'svc20',
      name: svc?.name ?? 'Snow Removal (Monthly Flat)',
      description: svc?.description ?? 'Flat monthly winter rate',
      qty: 5, unit: 'month',
      unitCost:       sfCalc?.unitCost       ?? svc?.defaultUnitCost  ?? 300,
      unitPrice:      sfCalc?.unitPrice      ?? svc?.defaultUnitPrice ?? 550,
      estimatedHours: sfCalc?.estimatedHours ?? svc?.estimatedHours   ?? 8,
      optional: false, taxable: false, isSnowPerTrip: false, notes: 'Nov–Mar · 5 months',
    }]);
  }

  function addSnowPerTrip() {
    if (lineItems.find(i => i.isSnowPerTrip)) return;
    const s = data.settings;
    const totalSF = turfSF + hardscapeSF;
    const events1_5 = s.snowEvents1_5in ?? 10;
    const events4   = s.snowEvents4in   ?? 5;
    const eff1_5    = s.snowEffSFPerHr1_5in ?? 44000;
    const eff4      = s.snowEffSFPerHr4in   ?? 30000;
    const totalEvents = events1_5 + events4;
    let costPerTrip = 0, pricePerTrip = 0;
    if (totalEvents > 0 && totalSF > 0) {
      const seasonHrs = (totalSF / eff1_5) * events1_5 + (totalSF / eff4) * events4;
      const avgHrs = seasonHrs / totalEvents;
      const rawCost = avgHrs * (s.plowingCostPerHour ?? 65);
      costPerTrip  = parseFloat(rawCost.toFixed(2));
      pricePerTrip = parseFloat((rawCost / (1 - s.targetMargin / 100)).toFixed(2));
    }
    setLineItems(prev => [...prev, {
      id: uid(), catalogItemId: 'snow_trip', name: 'Snow Removal - Per Trip',
      description: `${totalSF.toLocaleString()} SF · ${totalEvents} trips estimated`,
      qty: totalEvents || 1, unit: 'trip',
      unitCost: costPerTrip, unitPrice: pricePerTrip,
      estimatedHours: 0, optional: false, taxable: false, isSnowPerTrip: true, notes: '',
    }]);
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

  function recalcLineItem(li: EstimateLineItem) {
    if (li.catalogItemId === 'svc20') {
      const sfCalc = calcSnowFlatRateMonthly();
      if (!sfCalc) return;
      setLineItems(prev => prev.map(i => i.id === li.id ? { ...i, ...sfCalc } : i));
      return;
    }
    const svc = data.serviceCatalog.find(s => s.id === li.catalogItemId);
    if (!svc || turfSF === 0) return;
    const { hours, unitCost, unitPrice } = calcFromSF(svc);
    setLineItems(prev => prev.map(i => i.id === li.id ? { ...i, estimatedHours: hours, unitCost, unitPrice } : i));
  }

  function toggleMonth(m: Month) {
    setActiveMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  function handleClientSelect(cId: string) {
    setClientId(cId);
    const c = data.clients.find(cl => cl.id === cId);
    if (c) {
      const prop = c.properties?.find(p => p.isBillingAddress) ?? c.properties?.[0];
      const contact = c.contacts?.find(ct => ct.isPrimary) ?? c.contacts?.[0];
      setClientName(c.companyName || c.name || '');
      setAddress(prop?.street1 || c.billingAddress || '');
      setCity(prop?.city || c.city || '');
      setState_(prop?.state || c.state || '');
      setZip(prop?.zip || c.zip || '');
      setClientEmail(contact?.email || c.email || '');
      setPropertyType(c.type);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function buildContract(): Contract {
    const derivedHrs    = lineItems.filter(i => !i.optional).reduce((s, i) => s + (i.estimatedHours ?? 0), 0);

    return {
      id: quoteId,
      estimateNumber: existing?.estimateNumber ?? generateEstimateNumber((data.estimateCounter ?? 7) + 1),
      title,
      requestId: existing?.requestId ?? fromReqId ?? undefined,
      clientId: clientId || undefined,
      clientName: clientName.trim() || 'New Client',
      propertyType,
      address, city, state, zip, clientEmail, milesFromShop,
      turfSF, hardscapeSF, perimeterFt: 0,
      lineItems, visitsPerMonth, activeMonths,
      subtotalRevenue, totalCost, grossMargin,
      monthlyRevenue: monthlyBilling,
      annualRevenue: totalDue,
      estimatedHoursPerVisit: derivedHrs > 0 ? derivedHrs : 2,
      crewId: crewId || undefined,
      taxRate, taxRateId: taxRateId || undefined, discountAmount, additionalOverheadPct: overheadPct, consumablesPct, downPaymentRequired: downPaymentReq,
      startDate: existing?.startDate ?? '',
      endDate: existing?.endDate ?? '',
      status,
      notes, terms,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
  }

  function save() {
    const contract = buildContract();
    let updated: AppData;
    if (existing) {
      updated = { ...data, contracts: data.contracts.map(c => c.id === quoteId ? contract : c) };
    } else {
      const counter = (data.estimateCounter ?? 7) + 1;
      updated = { ...data, estimateCounter: counter, contracts: [...data.contracts, contract] };
    }
    setData(updated);
    saveData(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (!existing) navigate(`/quotes/${quoteId}`, { replace: true });
  }

  // Auto-save on blur — only when editing an existing quote
  function autoSave() {
    if (existing) save();
  }

  // ── Create Revision ─────────────────────────────────────────────────────────
  function createRevision() {
    if (!existing) return;
    if (!confirm('This will mark the current quote as "Changes Requested" and create a new revision. Continue?')) return;

    // Figure out revision number
    const maxRev = data.contracts
      .filter(c => c.revisionOf === (existing.revisionOf ?? existing.id) || c.id === (existing.revisionOf ?? existing.id))
      .reduce((max, c) => Math.max(max, c.revisionNumber ?? 0), 0);
    const newRevNum = maxRev + 1;

    // Mark current as changes_requested
    const currentContract = buildContract();
    const markedContract = { ...currentContract, status: 'changes_requested' as ContractStatus };

    // Create new revision with same data
    const revId = cid();
    const counter = (data.estimateCounter ?? 7) + 1;
    const revContract = {
      ...currentContract,
      id: revId,
      estimateNumber: generateEstimateNumber(counter),
      status: 'draft' as ContractStatus,
      title: existing.revisionNumber != null
        ? currentContract.title?.replace(/\s*—\s*Revision #\d+/, '') + ` — Revision #${newRevNum}`
        : (currentContract.title || existing.clientName) + ` — Revision #${newRevNum}`,
      revisionOf: existing.revisionOf ?? existing.id,
      revisionNumber: newRevNum,
      createdAt: new Date().toISOString(),
    };

    const updated: AppData = {
      ...data,
      estimateCounter: counter,
      contracts: data.contracts
        .map(c => c.id === existing.id ? markedContract : c)
        .concat(revContract),
    };
    setData(updated);
    saveData(updated);
    navigate(`/quotes/${revId}`, { replace: false });
  }

  function activate() {
    if (!confirm('Convert this quote to an active job?')) return;

    // ── Compute job costing codes from estimate data ──────────────────────────
    const burden       = 1 + (data.settings.payrollBurdenPercent ?? 13) / 100;
    const crew         = crewId ? data.crews.find(c => c.id === crewId) : null;
    const blendedRate  = crew && crew.memberIds.length > 0
      ? data.employees.filter(e => crew.memberIds.includes(e.id)).reduce((s, e) => s + e.hourlyRate * burden, 0)
      : (data.settings.laborRatePerHour ?? 22) * burden;

    const activeItems  = lineItems.filter(i => !i.optional);
    const maintItems   = activeItems.filter(i => !isSnowItem(i) && !i.isOneTime);
    const snowItems    = activeItems.filter(i => isSnowItem(i));

    // Maintenance codes
    const maintHrsPerVisit = maintItems.reduce((s, i) => s + (i.estimatedHours ?? 0), 0);
    const totalMaintVisits = visitsPerMonth * activeMonths.length;
    const maintLaborBudget = parseFloat((maintHrsPerVisit * totalMaintVisits * blendedRate).toFixed(2));

    // Equipment cost for maintenance items (via catalog equipmentIds)
    const maintEquipBudget = maintItems.reduce((sum, li) => {
      if (!li.catalogItemId) return sum;
      const svc = data.serviceCatalog.find(s => s.id === li.catalogItemId);
      if (!svc?.equipmentIds?.length) return sum;
      return sum + data.equipment
        .filter(e => svc.equipmentIds.includes(e.id))
        .reduce((s, e) => s + (e.paymentType === 'monthly_payment' ? e.monthlyPaymentAmount : e.monthlyDepreciation), 0)
        * activeMonths.length;
    }, 0);

    const maintTotalCost   = maintItems.reduce((s, i) => s + i.qty * i.unitCost, 0) * activeMonths.length;
    const maintOtherBudget = Math.max(0, parseFloat((maintTotalCost - maintLaborBudget - maintEquipBudget).toFixed(2)));

    const maintenanceCodes: AccountingCodeBucket[] = [
      { category: 'labor',         budgeted: maintLaborBudget,  actual: 0, notes: `${maintHrsPerVisit.toFixed(1)} hrs/visit × ${totalMaintVisits} visits` },
      { category: 'materials',     budgeted: 0,                 actual: 0, notes: '' },
      { category: 'subcontractor', budgeted: 0,                 actual: 0, notes: '' },
      { category: 'equipment',     budgeted: parseFloat(maintEquipBudget.toFixed(2)), actual: 0, notes: `${activeMonths.length} months` },
      { category: 'other',         budgeted: maintOtherBudget,  actual: 0, notes: 'Overhead, consumables' },
    ];

    // Snow codes (only if snow items exist)
    const snowCodes: AccountingCodeBucket[] = [];
    if (snowItems.length > 0) {
      const snowHrsPerMonth  = snowItems.reduce((s, i) => s + (i.estimatedHours ?? 0), 0);
      const snowLaborBudget  = parseFloat((snowHrsPerMonth * 5 * blendedRate).toFixed(2));
      const snowEquipBudget  = snowItems.reduce((sum, li) => {
        if (!li.catalogItemId) return sum;
        const svc = data.serviceCatalog.find(s => s.id === li.catalogItemId);
        if (!svc?.equipmentIds?.length) return sum;
        return sum + data.equipment
          .filter(e => svc.equipmentIds.includes(e.id))
          .reduce((s, e) => s + (e.paymentType === 'monthly_payment' ? e.monthlyPaymentAmount : e.monthlyDepreciation), 0) * 5;
      }, 0);
      const snowTotalCost    = snowItems.reduce((s, i) => s + i.qty * i.unitCost, 0);
      const snowOtherBudget  = Math.max(0, parseFloat((snowTotalCost - snowLaborBudget - snowEquipBudget).toFixed(2)));
      snowCodes.push(
        { category: 'labor',         budgeted: snowLaborBudget,  actual: 0, notes: `${snowHrsPerMonth.toFixed(1)} hrs/mo × 5 snow months` },
        { category: 'materials',     budgeted: 0,                actual: 0, notes: 'De-icing materials, salt' },
        { category: 'subcontractor', budgeted: 0,                actual: 0, notes: '' },
        { category: 'equipment',     budgeted: parseFloat(snowEquipBudget.toFixed(2)), actual: 0, notes: '5 snow months' },
        { category: 'other',         budgeted: snowOtherBudget,  actual: 0, notes: 'Overhead, consumables' },
      );
    }

    const costingCodes: JobCostingCodes = { maintenance: maintenanceCodes, snow: snowCodes };
    const contract = { ...buildContract(), status: 'active' as ContractStatus, costingCodes };

    // ── Build flat cost codes for Job record (merge maintenance + snow) ───────
    const allCodes = [...maintenanceCodes];
    snowCodes.forEach(sc => {
      const existing = allCodes.find(c => c.category === sc.category);
      if (existing) existing.budgeted += sc.budgeted;
      else allCodes.push({ ...sc });
    });

    // Drive time budget
    const driveTimeMin = milesFromShop > 0 ? Math.round((milesFromShop / (data.settings.averageSpeedMph || 30)) * 60) * 2 : 0;

    const jobCounter = (data.jobCounter ?? 1);
    const newJob: Job = {
      id:               `job_${Date.now()}`,
      jobNumber:        `J-${String(jobCounter).padStart(3, '0')}`,
      contractId:       contract.id,
      clientId:         contract.clientId,
      clientName:       contract.clientName,
      title:            contract.title || contract.clientName,
      jobType:          jobType === 'landscaping' ? 'landscaping' : snowItems.length > 0 && maintItems.length === 0 ? 'snow' : 'maintenance',
      status:           'active',
      startDate:        contract.startDate || new Date().toISOString().split('T')[0],
      endDate:          contract.endDate || '',
      crewId:           crewId || undefined,
      costCodes:        allCodes.map(c => ({ category: c.category as import('../types').CostCodeCategory, budgeted: c.budgeted, actual: c.actual, notes: c.notes })),
      driveTimeMinutes: driveTimeMin,
      hoursPerVisit:    maintHrsPerVisit,
      visitsPerMonth:   visitsPerMonth,
      projections:      [],
      notes:            '',
      createdAt:        new Date().toISOString(),
    };

    const updatedData = existing
      ? {
          ...data,
          contracts: data.contracts.map(c => c.id === quoteId ? contract : c),
          jobs: [...(data.jobs ?? []), newJob],
          jobCounter: jobCounter + 1,
        }
      : {
          ...data,
          estimateCounter: (data.estimateCounter ?? 7) + 1,
          contracts: [...data.contracts, contract],
          jobs: [...(data.jobs ?? []), newJob],
          jobCounter: jobCounter + 1,
        };
    setData(updatedData); saveData(updatedData);
    navigate(`/jobs`);
  }

  // ── Quote Totals calc ─────────────────────────────────────────────────────
  const s = data.settings;
  const activeItems       = lineItems.filter(i => !i.optional);
  const recurringMaintRev = activeItems.filter(i => !isSnowItem(i) && !i.isOneTime).reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const snowFlatRev       = activeItems.filter(i => isSnowItem(i) && !i.isSnowPerTrip).reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const snowPerTripItems  = activeItems.filter(i => i.isSnowPerTrip === true);
  const snowPerTripRev    = snowPerTripItems.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const snowPerTripCost   = snowPerTripItems.reduce((sum, i) => sum + i.qty * i.unitCost, 0);
  const oneTimeRev        = activeItems.filter(i => !isSnowItem(i) && i.isOneTime).reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const driveHrsRT        = milesFromShop > 0 ? (milesFromShop / (s.averageSpeedMph || 30)) * 2 : 0;
  const driveLaborCost    = parseFloat((driveHrsRT * getBlendedRate()).toFixed(2));
  const driveGallons      = milesFromShop > 0 ? (milesFromShop / (s.vehicleMpg || 12)) * 2 : 0;
  const driveFuelCost     = parseFloat((driveGallons * (s.fuelCostPerGallon || 3.50)).toFixed(2));
  const drivePerTrip      = driveLaborCost + driveFuelCost;
  // Maintenance: multiply per-trip cost by visits per month × active months
  const maintDriveAnnual  = drivePerTrip * visitsPerMonth * activeMonths.length;
  // Snow: multiply per-trip cost by total snow events (each event = 1 crew trip)
  const snowTotalEvents   = (s.snowEvents1_5in ?? 10) + (s.snowEvents4in ?? 5);
  const snowDriveAnnual   = snowFlatRev > 0 ? drivePerTrip * snowTotalEvents : 0;
  const annualDriveCost   = parseFloat((maintDriveAnnual + snowDriveAnnual).toFixed(2));
  const driveCharge       = annualDriveCost > 0 && s.targetMargin < 100 ? parseFloat((annualDriveCost / (1 - s.targetMargin / 100)).toFixed(2)) : annualDriveCost;
  const isLandscaping     = jobType === 'landscaping';
  // Landscaping: one-trip actual drive cost (no markup); Maintenance: annual marked-up drive charge
  const annualValue       = isLandscaping
    ? subtotalRevenue + drivePerTrip
    : recurringMaintRev * activeMonths.length + snowFlatRev + oneTimeRev + driveCharge;
  // Landscaping: all items are one-time (no month multiplier); Maintenance: recurring items × months
  const taxableAnnual     = isLandscaping
    ? activeItems.filter(i => i.taxable).reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
    : activeItems.filter(i => i.taxable && !i.isSnowPerTrip).reduce((sum, i) => {
        if (isSnowItem(i) || i.isOneTime) return sum + i.qty * i.unitPrice;
        return sum + i.qty * i.unitPrice * activeMonths.length;
      }, 0);
  // ── Overhead allocation from Resources fixed costs ──────────────────────────
  const totalMonthlyOverhead = data.overhead.reduce((sum, o) => sum + o.monthlyCost, 0);
  const otherActiveMonthlyRev = data.contracts
    .filter(c => c.status === 'active' && c.id !== quoteId)
    .reduce((sum, c) => sum + (c.monthlyRevenue || 0), 0);
  const revenueBase = Math.max(otherActiveMonthlyRev + recurringMaintRev, recurringMaintRev || 1);
  const overheadShare = recurringMaintRev > 0 ? recurringMaintRev / revenueBase : 0;
  const monthlyOverheadAlloc = totalMonthlyOverhead * overheadShare;
  const annualOverheadAlloc  = parseFloat((monthlyOverheadAlloc * activeMonths.length).toFixed(2));
  // Suggested overhead % = what the fixed costs represent relative to this quote's revenue
  const suggestedOverheadPct = annualValue > 0 ? parseFloat(((annualOverheadAlloc / annualValue) * 100).toFixed(1)) : 0;
  const overheadAmt    = parseFloat((annualValue * overheadPct    / 100).toFixed(2));
  const consumablesAmt = parseFloat((annualValue * consumablesPct / 100).toFixed(2));

  // ── Tax: pull from selected rate or manual entry ──────────────────────────
  const effectiveTaxRate = taxRateId
    ? (data.salesTaxRates ?? []).find(r => r.id === taxRateId)?.rate ?? taxRate
    : taxRate;

  const afterDiscount = Math.max(annualValue + overheadAmt + consumablesAmt - discountAmount, 0);
  const taxAmt        = parseFloat((taxableAnnual * effectiveTaxRate / 100).toFixed(2));
  const totalDue      = afterDiscount + taxAmt;
  const balanceDue    = Math.max(totalDue - downPaymentReq, 0);
  const overTarget    = grossMargin >= s.targetMargin;
  const monthlyBilling = totalDue > 0 ? parseFloat((totalDue / 12).toFixed(2)) : 0;

  const requestLink = existing?.requestId ? data.requests?.find(r => r.id === existing.requestId) : fromReq;
  const quoteNum = existing?.estimateNumber ?? '—';

  // ── Revision chain ───────────────────────────────────────────────────────────
  const rootId = existing?.revisionOf ?? existing?.id ?? '';
  const revisionChain = existing
    ? data.contracts
        .filter(c => c.id === rootId || c.revisionOf === rootId)
        .sort((a, b) => (a.revisionNumber ?? 0) - (b.revisionNumber ?? 0))
    : [];

  // Read-only mode: converted or rejected quotes show snapshot only
  const isReadOnly = existing?.status === 'converted' || existing?.status === 'rejected';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10 flex-wrap">
        <button onClick={() => navigate('/quotes')} className="text-gray-400 hover:text-gray-600 text-sm shrink-0">← Quotes</button>
        <span className="text-gray-300">|</span>
        <span className="text-xs font-mono text-gray-500 shrink-0">#{quoteNum}</span>

        {/* Revision chain breadcrumb */}
        {revisionChain.length > 1 && (
          <div className="flex items-center gap-1 text-xs shrink-0">
            {revisionChain.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">→</span>}
                <button
                  onClick={() => navigate(`/quotes/${c.id}`)}
                  className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${
                    c.id === existing?.id
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {c.revisionNumber ? `Rev #${c.revisionNumber}` : 'Original'}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Status selector — read-only badge for converted/rejected */}
        {isReadOnly ? (
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {QUOTE_STATUS_OPTIONS.find(o => o.value === status)?.label ?? status}
          </span>
        ) : (
          <select
            value={status}
            onChange={e => setStatus(e.target.value as ContractStatus)}
            className={`text-xs font-semibold px-3 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {QUOTE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        <div className="ml-auto flex gap-2 items-center flex-wrap">
          {saved && <span className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">Saved ✓</span>}
          {isReadOnly && (
            <span className="text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full font-semibold">Read-only snapshot</span>
          )}
          {requestLink && (
            <button onClick={() => navigate(`/requests/${requestLink.id}`)} className="text-xs text-gray-500 hover:text-[#27AE60] border border-gray-200 px-3 py-1.5 rounded-lg">
              Request #{requestLink.requestNumber}
            </button>
          )}
          <QuotePDFButton
            estimateNumber={quoteNum}
            clientName={clientName}
            address={address}
            city={city}
            state={state}
            zip={zip}
            lineItems={lineItems}
            jobType={jobType}
            totalDue={totalDue}
            monthlyBilling={monthlyBilling}
            createdAt={existing?.createdAt ?? new Date().toISOString()}
            notes={notes}
            terms={terms}
          />
          {!isReadOnly && (
            <>
              <button onClick={() => setStatus('awaiting_response')} className="btn-secondary text-sm px-4 py-1.5">Mark as Sent</button>
              {existing && (status === 'awaiting_response' || status === 'changes_requested' || status === 'draft' || status === 'approved') && (
                <button onClick={createRevision} className="btn-secondary text-sm px-4 py-1.5">
                  Create Revision
                </button>
              )}
              {status === 'approved' && (
                <button onClick={activate} className="bg-[#27AE60] text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-600 transition-colors font-medium">
                  Convert to Active Job →
                </button>
              )}
              <button onClick={save} className="btn-primary text-sm px-5 py-1.5">Save</button>
            </>
          )}
        </div>
      </div>

      {/* ── Read-only snapshot view ─────────────────────────────────────────── */}
      {isReadOnly && (
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{title || existing?.clientName}</h1>
            <p className="text-sm text-gray-500 mt-1">Quote #{quoteNum} · Created {existing ? new Date(existing.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</p>
          </div>

          {/* Client + address */}
          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Client</h3>
            <p className="font-semibold text-gray-900">{clientName}</p>
            <p className="text-sm text-gray-500">{[address, city, state, zip].filter(Boolean).join(', ')}</p>
            {clientEmail && <p className="text-sm text-[#27AE60]">{clientEmail}</p>}
          </div>

          {/* Line items */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Services</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Service</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Qty</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Unit</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Unit Price</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.filter(i => !i.optional).map(li => (
                  <tr key={li.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{li.name}</p>
                      {li.description && <p className="text-xs text-gray-400">{li.description}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{li.qty}</td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{li.unit}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(li.unitPrice)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(li.qty * li.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="card max-w-sm ml-auto">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Annual Total</span><span className="font-semibold">{formatCurrency(totalDue)}</span></div>
              <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-2 mt-2">
                <span>Monthly Billing</span><span className="text-[#27AE60]">{formatCurrency(monthlyBilling)}/mo</span>
              </div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Margin</span><span className={grossMargin >= s.targetMargin ? 'text-green-600 font-semibold' : 'text-orange-500 font-semibold'}>{formatPercent(grossMargin)}</span></div>
            </div>
          </div>

          {notes && (
            <div className="card">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{notes}</p>
            </div>
          )}

          {/* Link to current revision if one exists */}
          {(() => {
            const newerRevision = data.contracts.find(c => c.revisionOf === (existing?.revisionOf ?? existing?.id) && (c.revisionNumber ?? 0) > (existing?.revisionNumber ?? 0));
            if (!newerRevision) return null;
            return (
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-blue-600 text-sm">A newer revision exists:</span>
                <button onClick={() => navigate(`/quotes/${newerRevision.id}`)} className="text-sm font-semibold text-blue-700 hover:underline">
                  View {newerRevision.title || `Rev #${newerRevision.revisionNumber}`} →
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {!isReadOnly && <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* ── Quote Title ────────────────────────────────────────────────────── */}
        <input
          className="w-full text-3xl font-bold text-gray-900 bg-transparent border-0 border-b-2 border-transparent focus:border-[#27AE60] focus:outline-none pb-1"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={autoSave}
          placeholder="Quote title (e.g. Year Round Exterior Property Maintenance)"
        />

        {/* ── Client card + Quote meta ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5">
          {/* Client info */}
          <div className="col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <h3 className="font-semibold text-gray-900">{clientName || 'Client'}</h3>
              </div>
              {data.clients.length > 0 && (
                <select className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-500" value={clientId} onChange={e => handleClientSelect(e.target.value)}>
                  <option value="">Select existing client...</option>
                  {data.clients.map(c => <option key={c.id} value={c.id}>{c.companyName || c.name}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Client / Company</label>
                <input className="input" value={clientName} onChange={e => setClientName(e.target.value)} onBlur={autoSave} placeholder="Client name" />
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
                <input className="input" value={address} onChange={e => setAddress(e.target.value)} onBlur={autoSave} placeholder="Street address" />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" value={city} onChange={e => setCity(e.target.value)} onBlur={autoSave} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">State</label><input className="input" value={state} onChange={e => setState_(e.target.value)} onBlur={autoSave} maxLength={2} placeholder="MN" /></div>
                <div><label className="label">ZIP</label><input className="input" value={zip} onChange={e => setZip(e.target.value)} onBlur={autoSave} /></div>
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} onBlur={autoSave} />
              </div>
              <div>
                <label className="label">Miles from Shop</label>
                <div className="flex items-center gap-2">
                  <input className="input" type="number" min="0" step="0.1" value={milesFromShop || ''} onChange={e => setMilesFromShop(parseFloat(e.target.value) || 0)} onBlur={autoSave} placeholder="0" />
                  {milesFromShop > 0 && <span className="text-xs text-indigo-500 whitespace-nowrap">{((milesFromShop / (s.averageSpeedMph || 30)) * 2).toFixed(1)} hrs RT</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Quote metadata */}
          <div className="card flex flex-col justify-between">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Quote #</span>
                <span className="font-mono font-semibold text-gray-900">{quoteNum}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-700">{existing ? new Date(existing.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'}</span>
              </div>
              {requestLink && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Request</span>
                  <button onClick={() => navigate(`/requests/${requestLink.id}`)} className="text-[#27AE60] hover:underline text-xs">
                    #{requestLink.requestNumber}
                  </button>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <div className="flex gap-1">
                  {(['maintenance','landscaping'] as const).map(t => (
                    <button key={t} onClick={() => setJobType(t)}
                      className={`text-xs px-2 py-0.5 rounded font-medium ${jobType === t ? 'bg-[#27AE60] text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {t === 'maintenance' ? '🌿' : '🏗'} {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={`mt-4 p-3 rounded-xl ${overTarget ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className="text-xs text-gray-500 mb-0.5">Gross Margin</p>
              <p className={`text-2xl font-bold ${overTarget ? 'text-green-600' : 'text-yellow-600'}`}>{grossMargin > 0 ? formatPercent(grossMargin) : '—'}</p>
              <p className="text-xs text-gray-400">Target: {s.targetMargin}%</p>
            </div>
          </div>
        </div>

        {/* ── Property Measurements (maintenance) ───────────────────────────── */}
        {jobType === 'maintenance' && (
          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Property Measurements</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Turf Area (sq ft)</label>
                <input className="input" type="number" min="0" value={turfSF || ''} onChange={e => setTurfSF(Number(e.target.value))} placeholder="0" />
              </div>
              <div>
                <label className="label">Hard Surfaces (sq ft)</label>
                <input className="input" type="number" min="0" value={hardscapeSF || ''} onChange={e => setHardscapeSF(Number(e.target.value))} placeholder="0" />
              </div>
            </div>
          </div>
        )}

        {/* ── Season & Visits (maintenance) ──────────────────────────────────── */}
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
              <div className="flex items-end gap-2 pb-0.5">
                {(['year','seasonal','summer'] as const).map(p => {
                  const active = p === 'year' ? (includeSnow && activeMonths.length === 7) : p === 'seasonal' ? (!includeSnow && activeMonths.length === 7) : (!includeSnow && activeMonths.length === 5);
                  return (
                    <button key={p} type="button"
                      onClick={() => { if (p === 'year') { setActiveMonths(['apr','may','jun','jul','aug','sep','oct']); setIncludeSnow(true); } else if (p === 'seasonal') { setActiveMonths(['apr','may','jun','jul','aug','sep','oct']); setIncludeSnow(false); } else { setActiveMonths(['may','jun','jul','aug','sep']); setIncludeSnow(false); } }}
                      className={`text-xs px-2 py-1.5 rounded font-medium ${active ? 'bg-[#27AE60] text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                      {p === 'year' ? 'Year-Round' : p === 'seasonal' ? 'Seasonal (7mo)' : 'Summer (5mo)'}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-1.5">
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
                    className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all ${cls} ${SNOW_MOS.has(m) ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}>
                    {MONTH_LABELS[m][0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Snow Removal ────────────────────────────────────────────────────── */}
        {jobType === 'maintenance' && (
          <div className={`card transition-all ${includeSnow ? 'border-blue-200 bg-blue-50/20' : ''}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">❄ Snow Removal</h3>
              <div onClick={() => setIncludeSnow(v => !v)} className={`w-10 h-5 rounded-full cursor-pointer relative ${includeSnow ? 'bg-blue-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeSnow ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </div>
            {includeSnow && (
              <div className="mt-3 pt-3 border-t border-blue-100 flex gap-3">
                <button type="button" onClick={addSnowPerTrip}
                  className="flex-1 py-2 px-4 rounded-lg border-2 border-blue-400 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                  + Per Trip
                </button>
                <button type="button" onClick={addSnowFlatRate}
                  className="flex-1 py-2 px-4 rounded-lg border-2 border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors">
                  + Flat Rate / Month
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Crew ─────────────────────────────────────────────────────────── */}
        {data.crews.length > 0 && (
          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Crew Assignment</h3>
            <div className="flex gap-4 items-center">
              <select className="input flex-1" value={crewId} onChange={e => setCrewId(e.target.value)}>
                <option value="">No crew assigned</option>
                {data.crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {crewId && (() => {
                const crew = data.crews.find(c => c.id === crewId);
                const burden = 1 + (s.payrollBurdenPercent ?? 13) / 100;
                const members = crew ? data.employees.filter(e => crew.memberIds.includes(e.id)) : [];
                const blended = members.length > 0 ? members.reduce((sum, e) => sum + e.hourlyRate * burden, 0) / members.length : 0;
                return (
                  <div className="bg-green-50 rounded-xl px-4 py-2 text-sm">
                    <p className="text-xs text-gray-500">Blended rate</p>
                    <p className="text-lg font-bold text-[#27AE60]">${blended.toFixed(2)}/hr</p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Product / Service (Line Items) ──────────────────────────────── */}
        <div className="card p-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Product / Service</h3>
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
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Line Item</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Qty</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Unit</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-blue-500">Hrs</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-amber-600">Your Cost</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-700">Unit Price</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Margin</th>
                    <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Options</th>
                    <th className="w-10" />
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
                          <LineItemRow key={item.id} item={item} onChange={u => updateItem(item.id, u)} onDelete={() => removeItem(item.id)} onRecalc={() => recalcLineItem(item)} targetMargin={s.targetMargin} />
                        ))}
                        {snowItems.length > 0 && (
                          <tr className="bg-blue-50/70"><td colSpan={9} className="px-3 py-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-widest">❄ Snow Removal</td></tr>
                        )}
                        {snowItems.map(item => (
                          <LineItemRow key={item.id} item={item} onChange={u => updateItem(item.id, u)} onDelete={() => removeItem(item.id)} onRecalc={() => recalcLineItem(item)} targetMargin={s.targetMargin} />
                        ))}
                      </>
                    );
                  })()}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={3} className="px-3 py-3">
                      <button onClick={addBlank} className="text-xs text-[#27AE60] hover:underline font-medium">+ Add line item</button>
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-semibold text-blue-600">
                      {lineItems.filter(i => !i.optional).reduce((s, i) => s + (i.estimatedHours ?? 0), 0).toFixed(1)} hrs
                    </td>
                    <td className="px-2 py-3 text-right text-xs text-amber-600 font-semibold">{formatCurrency(totalCost)}</td>
                    <td className="px-2 py-3 text-right text-sm font-bold text-gray-900">{formatCurrency(subtotalRevenue)}</td>
                    <td className={`px-2 py-3 text-center text-sm font-bold ${overTarget ? 'text-green-600' : 'text-yellow-600'}`}>
                      {grossMargin > 0 ? formatPercent(grossMargin) : '—'}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Quote Totals ─────────────────────────────────────────────────── */}
        {lineItems.length > 0 && (
          <div className="card">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Quote Totals</h3>
            <div className="text-sm space-y-0">

              {/* ── Landscaping totals ── */}
              {isLandscaping ? (
                <>
                  {subtotalRevenue > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Line items subtotal</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(subtotalRevenue)}</span>
                    </div>
                  )}
                  {drivePerTrip > 0 && (
                    <div className="border-b border-gray-100">
                      <div className="flex justify-between py-2">
                        <span className="text-gray-500">🚗 Drive time (round trip)</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(drivePerTrip)}</span>
                      </div>
                      <div className="pb-2 text-[11px] text-gray-400">
                        {milesFromShop} mi × 2 · Labor {formatCurrency(driveLaborCost)} + Fuel {formatCurrency(driveFuelCost)}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 border-b-2 border-gray-200 font-semibold">
                    <span className="text-gray-700">Project Subtotal</span>
                    <span className="text-gray-900">{formatCurrency(annualValue)}</span>
                  </div>
                </>
              ) : (
                <>
                  {/* ── Maintenance revenue breakdown ── */}
                  {recurringMaintRev > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Recurring maintenance</span>
                      <span className="text-gray-700">{formatCurrency(recurringMaintRev)}/mo × {activeMonths.length} mo = <span className="font-semibold text-gray-900">{formatCurrency(recurringMaintRev * activeMonths.length)}</span></span>
                    </div>
                  )}
                  {snowFlatRev > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">❄ Snow removal (flat rate)</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(snowFlatRev)}</span>
                    </div>
                  )}
                  {oneTimeRev > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">One-time items</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(oneTimeRev)}</span>
                    </div>
                  )}
                  {driveCharge > 0 && (
                    <div className="border-b border-gray-100">
                      <div className="flex justify-between py-2">
                        <span className="text-gray-500">🚗 Drive time charge</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(driveCharge)}</span>
                      </div>
                      <div className="pb-2 text-[11px] text-gray-400">
                        {milesFromShop} mi × 2 · Labor {formatCurrency(driveLaborCost)} + Fuel {formatCurrency(driveFuelCost)} = {formatCurrency(drivePerTrip)}/trip · {visitsPerMonth} visits × {activeMonths.length} mo{snowFlatRev > 0 ? ` + ${snowTotalEvents} snow trips` : ''}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 border-b-2 border-gray-200 font-semibold">
                    <span className="text-gray-700">Annual Revenue (before overhead)</span>
                    <span className="text-gray-900">{formatCurrency(annualValue)}</span>
                  </div>
                </>
              )}

              {/* Fixed Overhead % */}
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                <span className="text-gray-600 flex items-center gap-2">
                  Fixed Overhead
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="50" step="0.5"
                      className="w-14 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#27AE60]"
                      value={overheadPct || ''} onChange={e => setOverheadPct(parseFloat(e.target.value) || 0)} placeholder="0" />
                    <span className="text-gray-400 text-xs">%</span>
                  </div>
                  {totalMonthlyOverhead > 0 && annualValue > 0 && (
                    <span className="text-[10px] text-blue-400">suggested: {suggestedOverheadPct}%</span>
                  )}
                </span>
                <span className={`font-medium ${overheadAmt > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                  {overheadAmt > 0 ? `+${formatCurrency(overheadAmt)}` : '—'}
                </span>
              </div>

              {/* Consumables % */}
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                <span className="text-gray-600 flex items-center gap-2">
                  Consumables
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="20" step="0.5"
                      className="w-14 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#27AE60]"
                      value={consumablesPct || ''} onChange={e => setConsumablesPct(parseFloat(e.target.value) || 0)} placeholder="0" />
                    <span className="text-gray-400 text-xs">%</span>
                  </div>
                  <span className="text-[10px] text-blue-400">suggested: 3%</span>
                </span>
                <span className={`font-medium ${consumablesAmt > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                  {consumablesAmt > 0 ? `+${formatCurrency(consumablesAmt)}` : '—'}
                </span>
              </div>

              {/* Discount */}
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                <span className="text-gray-600">Discount</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-sm">-$</span>
                  <input type="number" min="0" step="5" className="w-24 text-sm text-right border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-[#27AE60]"
                    value={discountAmount || ''} onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>

              {/* Sales Tax — only shown if taxable items exist */}
              {taxableAnnual > 0 && (
                <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                  <span className="text-gray-600 flex items-center gap-2">
                    Sales Tax
                    {(data.salesTaxRates ?? []).length > 0 ? (
                      <select
                        className="text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-[#27AE60]"
                        value={taxRateId}
                        onChange={e => {
                          setTaxRateId(e.target.value);
                          const r = (data.salesTaxRates ?? []).find(r => r.id === e.target.value);
                          if (r) setTaxRate(r.rate);
                          else if (!e.target.value) setTaxRate(0);
                        }}
                      >
                        <option value="">None</option>
                        {(data.salesTaxRates ?? []).map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.rate}%)</option>
                        ))}
                        <option value="__manual">Manual rate...</option>
                      </select>
                    ) : null}
                    {(taxRateId === '__manual' || (data.salesTaxRates ?? []).length === 0) && (
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" max="20" step="0.25" className="w-14 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#27AE60]"
                          value={taxRate || ''} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} placeholder="0" />
                        <span className="text-gray-400 text-xs">%</span>
                      </div>
                    )}
                  </span>
                  <span className={`font-medium ${taxAmt > 0 ? 'text-gray-700' : 'text-gray-300'}`}>{taxAmt > 0 ? `+${formatCurrency(taxAmt)}` : '—'}</span>
                </div>
              )}

              {/* Total Due */}
              <div className="flex justify-between py-3 border-b-2 border-gray-300 font-bold text-base">
                <span className="text-gray-900">{isLandscaping ? 'Project Total' : 'Total Annual Contract'}</span>
                <span className="text-gray-900">{formatCurrency(totalDue)}</span>
              </div>

              {/* Down Payment */}
              <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                <span className="text-gray-600">Down Payment Required</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">$</span>
                  <input type="number" min="0" step="50" className="w-24 text-sm text-right border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-[#27AE60]"
                    value={downPaymentReq || ''} onChange={e => setDownPaymentReq(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>

              {/* Balance */}
              <div className="flex justify-between items-center py-2.5 border-b border-gray-200">
                <span className="text-gray-700 font-semibold">Balance Due at Completion</span>
                <span className="font-bold text-gray-800">{formatCurrency(balanceDue)}</span>
              </div>

              {/* Monthly Billing Rate — maintenance only */}
              {!isLandscaping && totalDue > 0 && (
                <div className="mt-3 pt-3 border-t-2 border-[#27AE60]">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-900">Monthly Billing Rate</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatCurrency(totalDue)} annual ÷ 12 months</p>
                    </div>
                    <span className="text-2xl font-bold text-[#27AE60]">{formatCurrency(monthlyBilling)}<span className="text-sm font-normal text-gray-400">/mo</span></span>
                  </div>
                </div>
              )}

              {/* Per-trip snow */}
              {snowPerTripRev > 0 && (
                <div className="mt-4 pt-4 border-t-2 border-blue-200 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-500">❄ Per-Trip Snow Projection</p>
                  <p className="text-[11px] text-gray-400 italic">Not included in annual value — billed per event</p>
                  <div className="flex justify-between"><span className="text-gray-600">Expected Season Cost</span><span className="font-medium">{formatCurrency(snowPerTripCost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Projected Season Revenue</span><span className="font-semibold text-blue-700">{formatCurrency(snowPerTripRev)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Est. Snow Margin</span><span className="font-medium text-blue-600">{snowPerTripRev > 0 ? formatPercent(((snowPerTripRev - snowPerTripCost) / snowPerTripRev) * 100) : '—'}</span></div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── Notes & Terms ─────────────────────────────────────────────────── */}
        <div className="card">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Notes & Terms</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Notes (internal)</label>
              <textarea className="input resize-none" rows={4} value={notes} onChange={e => setNotes(e.target.value)} onBlur={autoSave} placeholder="Internal notes, scope, exclusions..." />
            </div>
            <div>
              <label className="label">Payment Terms</label>
              <textarea className="input resize-none" rows={4} value={terms} onChange={e => setTerms(e.target.value)} onBlur={autoSave} />
            </div>
          </div>
        </div>

        {/* ── Save bar ──────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pb-6">
          <button onClick={save} className="btn-primary flex-1 py-3 text-base">Save Quote</button>
          {status === 'approved' && (
            <button onClick={activate} className="bg-[#27AE60] text-white px-8 py-3 rounded-xl font-semibold hover:bg-green-600 transition-colors">
              Activate as Job →
            </button>
          )}
          <button onClick={() => navigate('/quotes')} className="btn-secondary px-6 py-3">Cancel</button>
        </div>
      </div>}

      {showCatalog && (
        <CatalogPicker catalog={data.serviceCatalog} onSelect={addFromCatalog} onClose={() => setShowCatalog(false)} />
      )}
    </div>
  );
}
