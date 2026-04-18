import { useState } from 'react';
import type { AppData, SnowTrip } from '../types';
import { saveData } from '../utils/storage';

interface Props { data: AppData; setData: (d: AppData) => void }

function uid()    { return `st_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function invUid() { return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function today()  { return new Date().toISOString().split('T')[0]; }

const STATUS_BADGE: Record<SnowTrip['status'], string> = {
  logged:   'bg-yellow-100 text-yellow-700',
  invoiced: 'bg-gray-100 text-gray-600',
  paid:     'bg-green-100 text-green-700',
};

function blankForm() {
  return {
    serviceDate:    today(),
    snowfallInches: 0,
    onSiteHours:    0,
    plowingHours:   0,
    shovelingHours: 0,
    deicingBags:    0,
    equipmentIds:   [] as string[],
    employeeIds:    [] as string[],
    notes:          '',
  };
}

export default function SnowRemoval({ data, setData }: Props) {
  const { settings } = data;

  // Active accounts (maintenance contracts) available for trip logging
  const activeContracts = data.contracts.filter(c => c.status === 'active' && data.jobs.some(j => j.contractId === c.id && j.status === 'active'));

  const [selectedContractId, setSelectedContractId] = useState<string>(activeContracts[0]?.id ?? '');
  const selectedContract = activeContracts.find(c => c.id === selectedContractId) ?? null;

  const [showLog, setShowLog]   = useState(false);
  const [form, setForm]         = useState(blankForm());
  const [showBatch, setShowBatch]         = useState(false);
  const [batchSelected, setBatchSelected] = useState<string[]>([]);

  function patch(u: Partial<typeof form>) { setForm(f => ({ ...f, ...u })); }

  function toggleEquipment(id: string) {
    setForm(f => ({ ...f, equipmentIds: f.equipmentIds.includes(id) ? f.equipmentIds.filter(x => x !== id) : [...f.equipmentIds, id] }));
  }
  function toggleEmployee(id: string) {
    setForm(f => ({ ...f, employeeIds: f.employeeIds.includes(id) ? f.employeeIds.filter(x => x !== id) : [...f.employeeIds, id] }));
  }

  function openLog() { setForm(blankForm()); setShowLog(true); }

  function logTrip() {
    if (!selectedContract) return;

    const trip: SnowTrip = {
      id:              uid(),
      jobId:           selectedContract.id,   // contract id used as account ref
      clientId:        selectedContract.clientId,
      clientName:      selectedContract.clientName,
      propertyAddress: [selectedContract.address, selectedContract.city, selectedContract.state].filter(Boolean).join(', '),
      serviceDate:     form.serviceDate,
      snowfallInches:  form.snowfallInches,
      onSiteHours:     form.onSiteHours,
      plowingHours:    form.plowingHours,
      shovelingHours:  form.shovelingHours,
      deicingBags:     form.deicingBags,
      equipmentIds:    form.equipmentIds,
      employeeIds:     form.employeeIds,
      notes:           form.notes,
      status:          'logged',
      createdAt:       new Date().toISOString(),
    };

    const updated: AppData = {
      ...data,
      snowTripCounter: (data.snowTripCounter ?? 1) + 1,
      snowTrips: [...data.snowTrips, trip],
    };
    setData(updated);
    saveData(updated);
    setShowLog(false);
  }

  // All trips for the selected contract, newest first
  const trips = data.snowTrips
    .filter(t => t.jobId === selectedContractId)
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));

  function tripRevenue(t: SnowTrip) {
    return (t.plowingHours  * settings.plowingRatePerHour)
         + (t.shovelingHours * settings.shovelingRatePerHour)
         + (t.deicingBags    * settings.deicingRatePerBag);
  }
  function tripCost(t: SnowTrip) {
    return (t.plowingHours + t.shovelingHours) * settings.plowingCostPerHour
         + t.deicingBags * settings.deicingCostPerBag;
  }

  const seasonRevenue = trips.reduce((s, t) => s + tripRevenue(t), 0);
  const seasonCost    = trips.reduce((s, t) => s + tripCost(t),    0);
  const seasonMargin  = seasonRevenue > 0 ? ((seasonRevenue - seasonCost) / seasonRevenue) * 100 : 0;

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  // ── Batch invoice generation ─────────────────────────────────────────────────
  function generateBatchInvoices() {
    if (batchSelected.length === 0) return;
    let updated = { ...data };
    const newInvoices = [...data.invoices];
    let counter = data.invoiceCounter ?? 1;
    const updatedTrips = [...data.snowTrips];

    for (const contractId of batchSelected) {
      const contract = data.contracts.find(c => c.id === contractId);
      if (!contract) continue;
      const pending = data.snowTrips.filter(t => t.jobId === contractId && t.status === 'logged');
      if (pending.length === 0) continue;

      const lineItems = pending.map(t => ({
        id:          uid(),
        name:        `Snow Trip — ${t.serviceDate}`,
        description: [
          t.snowfallInches > 0 ? `${t.snowfallInches}" snowfall` : '',
          t.plowingHours   > 0 ? `${t.plowingHours}h plowing`   : '',
          t.shovelingHours > 0 ? `${t.shovelingHours}h shoveling` : '',
          t.deicingBags    > 0 ? `${t.deicingBags} bags deicing` : '',
        ].filter(Boolean).join(' · '),
        qty:      1,
        unit:     'trip',
        unitCost: (t.plowingHours + t.shovelingHours) * settings.plowingCostPerHour + t.deicingBags * settings.deicingCostPerBag,
        unitPrice: tripRevenue(t),
        optional:  false,
        taxable:   false,
        notes:     t.notes,
      }));

      const subtotal = lineItems.reduce((s, li) => s + li.unitPrice, 0);
      counter += 1;
      const invId = invUid();

      newInvoices.push({
        id:            invId,
        invoiceNumber: `INV-${String(counter).padStart(4, '0')}`,
        clientId:      contract.clientId,
        clientName:    contract.clientName,
        contractId:    contract.id,
        snowTripIds:   pending.map(t => t.id),
        lineItems,
        subtotal,
        taxRate:       contract.taxRate ?? 0,
        taxAmount:     0,
        discountAmount: 0,
        total:         subtotal,
        status:        'draft',
        issuedDate:    today(),
        dueDate:       '',
        paidDate:      '',
        paidAmount:    0,
        notes:         `Snow removal — ${pending.length} trip${pending.length > 1 ? 's' : ''}`,
        createdAt:     new Date().toISOString(),
      });

      pending.forEach(t => {
        const idx = updatedTrips.findIndex(x => x.id === t.id);
        if (idx >= 0) updatedTrips[idx] = { ...updatedTrips[idx], status: 'invoiced', invoiceId: invId };
      });
    }

    updated = { ...updated, invoices: newInvoices, snowTrips: updatedTrips, invoiceCounter: counter };
    setData(updated);
    saveData(updated);
    setShowBatch(false);
    setBatchSelected([]);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">❄ Snow Trip Tracker</h1>
          <p className="text-sm text-gray-400 mt-0.5">Log trips per service account and generate invoices</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowBatch(true); setBatchSelected([]); }}
            className="btn-secondary text-sm px-4 py-2"
          >
            Create Invoices
          </button>
          <button
            onClick={openLog}
            disabled={!selectedContract}
            className="btn-primary text-sm px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Log Trip
          </button>
        </div>
      </div>

      {/* ── Account selector ── */}
      <div className="card">
        <label className="label">Account</label>
        {activeContracts.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No active contracts yet. Activate a quote first.</p>
        ) : (
          <select
            className="input max-w-sm"
            value={selectedContractId}
            onChange={e => setSelectedContractId(e.target.value)}
          >
            <option value="">— Select account —</option>
            {activeContracts.map(c => (
              <option key={c.id} value={c.id}>
                {c.clientName}{c.title ? ` — ${c.title}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Season summary (only when account selected) ── */}
      {selectedContract && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Trips',     value: String(trips.length),         color: 'text-gray-900' },
            { label: 'Season Revenue',  value: fmt(seasonRevenue),            color: 'text-[#27AE60]' },
            { label: 'Season Cost',     value: fmt(seasonCost),               color: 'text-gray-900' },
            { label: 'Margin',          value: `${seasonMargin.toFixed(1)}%`, color: seasonMargin >= 40 ? 'text-[#27AE60]' : 'text-orange-500' },
          ].map(m => (
            <div key={m.label} className="card text-center py-4">
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-500 mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Trip table ── */}
      {!selectedContract ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">❄</p>
          <p className="font-medium">Select an account above to view trips</p>
        </div>
      ) : trips.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">❄</p>
          <p className="font-medium text-gray-600">No trips logged for {selectedContract.clientName} yet</p>
          <p className="text-sm mt-1">Click "+ Log Trip" to record the first visit</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Date','Snow','On Site','Plow','Shovel','Deicing','Crew','Revenue','Status'].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 ${h === 'Revenue' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trips.map(t => {
                const employees = data.employees.filter(e => t.employeeIds.includes(e.id));
                const equipment = data.equipment.filter(e => t.equipmentIds.includes(e.id));
                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {new Date(t.serviceDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.snowfallInches}"</td>
                    <td className="px-4 py-3 text-gray-600">{t.onSiteHours}h</td>
                    <td className="px-4 py-3 text-gray-600">{t.plowingHours}h</td>
                    <td className="px-4 py-3 text-gray-600">{t.shovelingHours}h</td>
                    <td className="px-4 py-3 text-gray-600">{t.deicingBags} bags</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {employees.map(e => <span key={e.id} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">{e.name.split(' ')[0]}</span>)}
                        {equipment.map(e => <span key={e.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{e.name.split(' ')[0]}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmt(tripRevenue(t))}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Log Trip Modal ── */}
      {showLog && selectedContract && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Log Snow Trip</h2>
                <p className="text-sm text-gray-500">{selectedContract.clientName}</p>
                {selectedContract.address && (
                  <p className="text-xs text-gray-400">{[selectedContract.address, selectedContract.city, selectedContract.state].filter(Boolean).join(', ')}</p>
                )}
              </div>
              <button onClick={() => setShowLog(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Service Date</label>
                  <input type="date" className="input" value={form.serviceDate} onChange={e => patch({ serviceDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">Snowfall (inches)</label>
                  <input type="number" min="0" step="0.5" className="input" value={form.snowfallInches || ''} onChange={e => patch({ snowfallInches: parseFloat(e.target.value) || 0 })} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Total On-Site Hours</label>
                  <input type="number" min="0" step="0.25" className="input" value={form.onSiteHours || ''} onChange={e => patch({ onSiteHours: parseFloat(e.target.value) || 0 })} placeholder="0" />
                </div>
                <div>
                  <label className="label">Plowing Hours</label>
                  <input type="number" min="0" step="0.25" className="input" value={form.plowingHours || ''} onChange={e => patch({ plowingHours: parseFloat(e.target.value) || 0 })} placeholder="0" />
                  <p className="text-[10px] text-gray-400 mt-0.5">{fmt(form.plowingHours * settings.plowingRatePerHour)} rev</p>
                </div>
                <div>
                  <label className="label">Shoveling Hours</label>
                  <input type="number" min="0" step="0.25" className="input" value={form.shovelingHours || ''} onChange={e => patch({ shovelingHours: parseFloat(e.target.value) || 0 })} placeholder="0" />
                  <p className="text-[10px] text-gray-400 mt-0.5">{fmt(form.shovelingHours * settings.shovelingRatePerHour)} rev</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">De-icing Bags Used</label>
                  <input type="number" min="0" step="1" className="input" value={form.deicingBags || ''} onChange={e => patch({ deicingBags: parseInt(e.target.value) || 0 })} placeholder="0" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Cost: {fmt(form.deicingBags * settings.deicingCostPerBag)} · Rev: {fmt(form.deicingBags * settings.deicingRatePerBag)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 flex flex-col justify-center">
                  <p className="text-xs text-gray-500 mb-1">Trip Total Revenue</p>
                  <p className="text-2xl font-bold text-[#27AE60]">
                    {fmt(form.plowingHours * settings.plowingRatePerHour + form.shovelingHours * settings.shovelingRatePerHour + form.deicingBags * settings.deicingRatePerBag)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Cost: {fmt((form.plowingHours + form.shovelingHours) * settings.plowingCostPerHour + form.deicingBags * settings.deicingCostPerBag)}</p>
                </div>
              </div>

              <div>
                <label className="label">Crew Members Present</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {data.employees.map(emp => (
                    <button key={emp.id} type="button" onClick={() => toggleEmployee(emp.id)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${form.employeeIds.includes(emp.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                      {emp.name}
                    </button>
                  ))}
                  {data.employees.length === 0 && <p className="text-xs text-gray-400 italic">No employees set up yet</p>}
                </div>
              </div>

              <div>
                <label className="label">Equipment Used</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {data.equipment.map(eq => (
                    <button key={eq.id} type="button" onClick={() => toggleEquipment(eq.id)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${form.equipmentIds.includes(eq.id) ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                      {eq.name}
                    </button>
                  ))}
                  {data.equipment.length === 0 && <p className="text-xs text-gray-400 italic">No equipment set up yet</p>}
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => patch({ notes: e.target.value })} placeholder="Any notes about this trip…" />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={logTrip} className="btn-primary flex-1">Log Trip</button>
              <button onClick={() => setShowLog(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Invoice Modal ── */}
      {showBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Create Invoices</h2>
                <p className="text-sm text-gray-500">One invoice per account — logged trips only</p>
              </div>
              <button onClick={() => setShowBatch(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
              {activeContracts.length === 0 && (
                <p className="text-sm text-gray-400 italic text-center py-4">No active accounts</p>
              )}
              {activeContracts.map(c => {
                const pending    = data.snowTrips.filter(t => t.jobId === c.id && t.status === 'logged');
                const pendingRev = pending.reduce((s, t) => s + tripRevenue(t), 0);
                const hasPending = pending.length > 0;
                return (
                  <div key={c.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      batchSelected.includes(c.id) ? 'border-[#27AE60] bg-green-50' : 'border-gray-200 bg-white'
                    } ${!hasPending ? 'opacity-40' : 'cursor-pointer'}`}
                    onClick={() => hasPending && setBatchSelected(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                  >
                    <input type="checkbox" checked={batchSelected.includes(c.id)} onChange={() => {}} disabled={!hasPending} className="accent-[#27AE60]" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800">{c.clientName}{c.title ? ` — ${c.title}` : ''}</p>
                      <p className="text-xs text-gray-400">{pending.length} pending trip{pending.length !== 1 ? 's' : ''}</p>
                    </div>
                    {hasPending && <span className="text-sm font-semibold text-[#27AE60]">{fmt(pendingRev)}</span>}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={generateBatchInvoices}
                disabled={batchSelected.length === 0}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                Generate {batchSelected.length > 0 ? batchSelected.length : ''} Invoice{batchSelected.length !== 1 ? 's' : ''}
              </button>
              <button onClick={() => setShowBatch(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
