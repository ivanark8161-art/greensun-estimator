import { useState } from 'react';
import type { AppData, SnowTrip } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

function uid() { return `st_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

const STATUS_BADGE: Record<SnowTrip['status'], string> = {
  logged:   'badge-yellow',
  invoiced: 'badge-gray',
  paid:     'badge-green',
};

export default function SnowRemoval({ data, setData }: Props) {
  const { settings } = data;

  // Form state
  const [clientName, setClientName] = useState('');
  const [contractId, setContractId] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [snowfallInches, setSnowfallInches] = useState(0);
  const [plowingHours, setPlowingHours] = useState(0);
  const [shovelingHours, setShovelingHours] = useState(0);
  const [deicingBags, setDeicingBags] = useState(0);
  const [notes, setNotes] = useState('');

  // Rate overrides (default from settings)
  const [plowRate, setPlowRate] = useState(settings.plowingRatePerHour);
  const [shovRate, setShovRate] = useState(settings.shovelingRatePerHour);
  const [deicRate, setDeicRate] = useState(settings.deicingRatePerBag);
  const [plowCost, setPlowCost] = useState(settings.plowingCostPerHour);
  const [shovCost, setShovCost] = useState(settings.shovelingCostPerHour);
  const [deicCost, setDeicCost] = useState(settings.deicingCostPerBag);
  const [showRateEdit, setShowRateEdit] = useState(false);

  // Filter
  const [filterContract, setFilterContract] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | SnowTrip['status']>('all');
  const [viewTrip, setViewTrip] = useState<SnowTrip | null>(null);

  // Calculated totals for current form
  const plowRevenue = plowingHours * plowRate;
  const shovRevenue = shovelingHours * shovRate;
  const deicRevenue = deicingBags * deicRate;
  const totalRevenue = plowRevenue + shovRevenue + deicRevenue;
  const totalCost = plowingHours * plowCost + shovelingHours * shovCost + deicingBags * deicCost;
  const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

  function handleContractSelect(id: string) {
    setContractId(id);
    const c = data.contracts.find(c => c.id === id);
    if (c) { setClientName(c.clientName); setPropertyAddress(c.address); }
  }

  function logTrip() {
    if (!clientName.trim()) { alert('Client name required'); return; }
    if (totalRevenue === 0) { alert('Enter at least one service (plowing, shoveling, or de-icing)'); return; }
    const trip: SnowTrip = {
      id: uid(), contractId: contractId || undefined,
      clientName, propertyAddress, date, snowfallInches,
      plowingHours, plowingRate: plowRate, plowingCostRate: plowCost,
      shovelingHours, shovelingRate: shovRate, shovelingCostRate: shovCost,
      deicingBags, deicingRate: deicRate, deicingCostRate: deicCost,
      notes, totalRevenue, totalCost, status: 'logged',
    };
    const updated = { ...data, snowTrips: [trip, ...data.snowTrips] };
    setData(updated); saveData(updated);
    // Reset form
    setPlowingHours(0); setShovelingHours(0); setDeicingBags(0);
    setSnowfallInches(0); setNotes('');
  }

  function updateTripStatus(id: string, status: SnowTrip['status']) {
    const updated = { ...data, snowTrips: data.snowTrips.map(t => t.id === id ? { ...t, status } : t) };
    setData(updated); saveData(updated);
    if (viewTrip?.id === id) setViewTrip({ ...viewTrip, status });
  }

  function deleteTrip(id: string) {
    if (!confirm('Delete this trip?')) return;
    const updated = { ...data, snowTrips: data.snowTrips.filter(t => t.id !== id) };
    setData(updated); saveData(updated);
    setViewTrip(null);
  }

  const filteredTrips = data.snowTrips.filter(t =>
    (filterContract === 'all' || t.contractId === filterContract || t.clientName === filterContract) &&
    (filterStatus === 'all' || t.status === filterStatus)
  );

  // Aggregate stats
  const totalUnpaidRevenue = data.snowTrips.filter(t => t.status !== 'paid').reduce((s, t) => s + t.totalRevenue, 0);
  const totalPaidRevenue   = data.snowTrips.filter(t => t.status === 'paid').reduce((s, t) => s + t.totalRevenue, 0);
  const totalSeasonRevenue = data.snowTrips.reduce((s, t) => s + t.totalRevenue, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Snow Removal"
        subtitle="Log per-trip snow service events — plowing, shoveling, de-icing"
      />

      {/* Season stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card border-blue-200 bg-blue-50">
          <p className="text-xs text-blue-600 font-semibold uppercase">Season Total</p>
          <p className="text-2xl font-bold text-blue-800">{formatCurrency(totalSeasonRevenue)}</p>
          <p className="text-xs text-blue-500">{data.snowTrips.length} trips logged</p>
        </div>
        <div className="card border-yellow-200 bg-yellow-50">
          <p className="text-xs text-yellow-700 font-semibold uppercase">Unpaid / Pending</p>
          <p className="text-2xl font-bold text-yellow-800">{formatCurrency(totalUnpaidRevenue)}</p>
          <p className="text-xs text-yellow-600">{data.snowTrips.filter(t => t.status !== 'paid').length} trips not paid</p>
        </div>
        <div className="card border-green-200 bg-green-50">
          <p className="text-xs text-green-700 font-semibold uppercase">Collected</p>
          <p className="text-2xl font-bold text-green-800">{formatCurrency(totalPaidRevenue)}</p>
          <p className="text-xs text-green-600">{data.snowTrips.filter(t => t.status === 'paid').length} trips paid</p>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* ── LOG TRIP FORM (2/5) ──────────────────────────────────── */}
        <div className="md:col-span-2">
          <div className="card">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Log a Snow Trip</h2>

            {/* Client */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="label">Client / Property *</label>
                <div className="flex gap-2">
                  <input className="input flex-1" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name" />
                  {data.contracts.length > 0 && (
                    <select className="input w-36 text-xs" value={contractId} onChange={e => handleContractSelect(e.target.value)}>
                      <option value="">Select...</option>
                      {data.contracts.map(c => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="Property address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Service Date</label>
                  <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Snowfall (inches)</label>
                  <input className="input" type="number" min="0" step="0.5" value={snowfallInches || ''} onChange={e => setSnowfallInches(parseFloat(e.target.value) || 0)} placeholder="e.g. 4.5" />
                </div>
              </div>
            </div>

            {/* Services */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Services Performed</h3>
                <button onClick={() => setShowRateEdit(true)} className="text-xs text-[#27AE60] hover:underline">Edit Rates</button>
              </div>

              {/* Plowing */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-700">Snow Plowing</label>
                  <span className="text-xs text-gray-400">{formatCurrency(plowRate)}/hr client · {formatCurrency(plowCost)}/hr cost</span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="12" step="0.5" value={plowingHours} onChange={e => setPlowingHours(parseFloat(e.target.value))} className="flex-1 accent-[#27AE60]" />
                  <div className="flex items-center gap-1 w-20">
                    <input type="number" min="0" step="0.5" className="input w-16 text-center py-1 text-sm" value={plowingHours || ''} onChange={e => setPlowingHours(parseFloat(e.target.value) || 0)} />
                    <span className="text-xs text-gray-400">hr</span>
                  </div>
                </div>
                {plowingHours > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-amber-600">Cost: {formatCurrency(plowingHours * plowCost)}</span>
                    <span className="text-green-600 font-semibold">Billed: {formatCurrency(plowRevenue)}</span>
                  </div>
                )}
              </div>

              {/* Shoveling */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-700">Snow Shoveling</label>
                  <span className="text-xs text-gray-400">{formatCurrency(shovRate)}/hr client · {formatCurrency(shovCost)}/hr cost</span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="8" step="0.5" value={shovelingHours} onChange={e => setShovelingHours(parseFloat(e.target.value))} className="flex-1 accent-[#27AE60]" />
                  <div className="flex items-center gap-1 w-20">
                    <input type="number" min="0" step="0.5" className="input w-16 text-center py-1 text-sm" value={shovelingHours || ''} onChange={e => setShovelingHours(parseFloat(e.target.value) || 0)} />
                    <span className="text-xs text-gray-400">hr</span>
                  </div>
                </div>
                {shovelingHours > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-amber-600">Cost: {formatCurrency(shovelingHours * shovCost)}</span>
                    <span className="text-green-600 font-semibold">Billed: {formatCurrency(shovRevenue)}</span>
                  </div>
                )}
              </div>

              {/* De-icing */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-gray-700">De-icing Material</label>
                  <span className="text-xs text-gray-400">{formatCurrency(deicRate)}/bag client · {formatCurrency(deicCost)}/bag cost</span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="20" step="1" value={deicingBags} onChange={e => setDeicingBags(parseInt(e.target.value))} className="flex-1 accent-[#27AE60]" />
                  <div className="flex items-center gap-1 w-24">
                    <input type="number" min="0" step="1" className="input w-16 text-center py-1 text-sm" value={deicingBags || ''} onChange={e => setDeicingBags(parseInt(e.target.value) || 0)} />
                    <span className="text-xs text-gray-400">bags</span>
                  </div>
                </div>
                {deicingBags > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-amber-600">Cost: {formatCurrency(deicingBags * deicCost)}</span>
                    <span className="text-green-600 font-semibold">Billed: {formatCurrency(deicRevenue)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Trip total */}
            {totalRevenue > 0 && (
              <div className="rounded-xl border-2 border-[#27AE60] bg-green-50 p-4 mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold text-gray-700">Trip Total</span>
                  <span className="text-2xl font-bold text-[#27AE60]">{formatCurrency(totalRevenue)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Your cost: {formatCurrency(totalCost)}</span>
                  <span>Margin: {formatCurrency(totalRevenue - totalCost)} ({margin.toFixed(0)}%)</span>
                </div>
                <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                  {plowingHours > 0 && <div className="flex justify-between"><span>Plowing ({plowingHours} hrs)</span><span>{formatCurrency(plowRevenue)}</span></div>}
                  {shovelingHours > 0 && <div className="flex justify-between"><span>Shoveling ({shovelingHours} hrs)</span><span>{formatCurrency(shovRevenue)}</span></div>}
                  {deicingBags > 0 && <div className="flex justify-between"><span>De-icing ({deicingBags} bags)</span><span>{formatCurrency(deicRevenue)}</span></div>}
                </div>
              </div>
            )}

            <div className="mb-3">
              <label className="label">Notes</label>
              <textarea className="input resize-none text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Conditions, scope details, issues encountered..." />
            </div>

            <button onClick={logTrip} className="btn-primary w-full py-2.5 text-sm font-semibold" disabled={totalRevenue === 0}>
              Log Trip {totalRevenue > 0 ? `· ${formatCurrency(totalRevenue)}` : ''}
            </button>
          </div>
        </div>

        {/* ── TRIP HISTORY (3/5) ───────────────────────────────────── */}
        <div className="md:col-span-3">
          <div className="card p-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-800">Trip Log</h2>
              <div className="flex gap-2">
                <select className="input py-1 text-xs w-40" value={filterContract} onChange={e => setFilterContract(e.target.value)}>
                  <option value="all">All Properties</option>
                  {[...new Set(data.snowTrips.map(t => t.clientName))].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select className="input py-1 text-xs w-28" value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}>
                  <option value="all">All Status</option>
                  <option value="logged">Logged</option>
                  <option value="invoiced">Invoiced</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            {filteredTrips.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">❄️</p>
                <p className="text-sm">No snow trips logged yet.</p>
                <p className="text-xs mt-1">Use the form on the left to log a service event.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Client / Property</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Snowfall</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Services</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Total</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTrips.map(trip => (
                    <tr key={trip.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewTrip(trip)}>
                      <td className="px-4 py-3 text-gray-600 text-xs">{trip.date}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{trip.clientName}</p>
                        <p className="text-xs text-gray-400">{trip.propertyAddress}</p>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-600">{trip.snowfallInches > 0 ? `${trip.snowfallInches}"` : '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex gap-1 justify-center flex-wrap">
                          {trip.plowingHours > 0 && <span className="badge-gray">{trip.plowingHours}hr plow</span>}
                          {trip.shovelingHours > 0 && <span className="badge-gray">{trip.shovelingHours}hr shovel</span>}
                          {trip.deicingBags > 0 && <span className="badge-gray">{trip.deicingBags} bags</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(trip.totalRevenue)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={STATUS_BADGE[trip.status] + ' capitalize'}>{trip.status}</span>
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <select className="text-xs border border-gray-200 rounded px-1 py-0.5"
                          value={trip.status}
                          onChange={e => updateTripStatus(trip.id, e.target.value as SnowTrip['status'])}>
                          <option value="logged">Logged</option>
                          <option value="invoiced">Invoiced</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={4} className="px-4 py-3 text-xs text-gray-500 font-medium">
                      {filteredTrips.length} trips shown
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {formatCurrency(filteredTrips.reduce((s, t) => s + t.totalRevenue, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Trip Detail Modal */}
      {viewTrip && (
        <Modal title={`Snow Trip — ${viewTrip.date}`} onClose={() => setViewTrip(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">Client</p><p className="font-semibold">{viewTrip.clientName}</p></div>
              <div><p className="text-xs text-gray-400">Address</p><p>{viewTrip.propertyAddress || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Date</p><p>{viewTrip.date}</p></div>
              <div><p className="text-xs text-gray-400">Snowfall</p><p>{viewTrip.snowfallInches > 0 ? `${viewTrip.snowfallInches}"` : '—'}</p></div>
            </div>

            <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-50">
                <th className="text-left px-3 py-2 text-xs text-gray-500">Service</th>
                <th className="text-center px-3 py-2 text-xs text-gray-500">Qty</th>
                <th className="text-right px-3 py-2 text-xs text-amber-600">Your Cost</th>
                <th className="text-right px-3 py-2 text-xs text-gray-700">Billed</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {viewTrip.plowingHours > 0 && <tr>
                  <td className="px-3 py-2">Snow Plowing</td>
                  <td className="px-3 py-2 text-center">{viewTrip.plowingHours} hrs @ {formatCurrency(viewTrip.plowingRate)}/hr</td>
                  <td className="px-3 py-2 text-right text-amber-600">{formatCurrency(viewTrip.plowingHours * viewTrip.plowingCostRate)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(viewTrip.plowingHours * viewTrip.plowingRate)}</td>
                </tr>}
                {viewTrip.shovelingHours > 0 && <tr>
                  <td className="px-3 py-2">Snow Shoveling</td>
                  <td className="px-3 py-2 text-center">{viewTrip.shovelingHours} hrs @ {formatCurrency(viewTrip.shovelingRate)}/hr</td>
                  <td className="px-3 py-2 text-right text-amber-600">{formatCurrency(viewTrip.shovelingHours * viewTrip.shovelingCostRate)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(viewTrip.shovelingHours * viewTrip.shovelingRate)}</td>
                </tr>}
                {viewTrip.deicingBags > 0 && <tr>
                  <td className="px-3 py-2">De-icing Material</td>
                  <td className="px-3 py-2 text-center">{viewTrip.deicingBags} bags @ {formatCurrency(viewTrip.deicingRate)}/bag</td>
                  <td className="px-3 py-2 text-right text-amber-600">{formatCurrency(viewTrip.deicingBags * viewTrip.deicingCostRate)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(viewTrip.deicingBags * viewTrip.deicingRate)}</td>
                </tr>}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-500">TOTAL</td>
                  <td className="px-3 py-2 text-right text-amber-600 font-bold">{formatCurrency(viewTrip.totalCost)}</td>
                  <td className="px-3 py-2 text-right text-[#27AE60] font-bold text-base">{formatCurrency(viewTrip.totalRevenue)}</td>
                </tr>
              </tbody>
            </table>

            {viewTrip.notes && <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600"><p className="text-xs text-gray-400 mb-1">Notes</p>{viewTrip.notes}</div>}

            <div className="flex gap-3 pt-2 border-t">
              <select className="input flex-1" value={viewTrip.status}
                onChange={e => updateTripStatus(viewTrip.id, e.target.value as SnowTrip['status'])}>
                <option value="logged">Logged</option>
                <option value="invoiced">Invoiced</option>
                <option value="paid">Paid</option>
              </select>
              <button className="btn-danger" onClick={() => deleteTrip(viewTrip.id)}>Delete</button>
              <button className="btn-secondary" onClick={() => setViewTrip(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Rates Modal */}
      {showRateEdit && (
        <Modal title="Edit Snow Service Rates" onClose={() => setShowRateEdit(false)}>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">These rates apply to this session. To change the defaults, go to Resources → Settings.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Plowing — Client Rate ($/hr)</label><input className="input" type="number" value={plowRate} onChange={e => setPlowRate(Number(e.target.value))} /></div>
              <div><label className="label">Plowing — Your Cost ($/hr)</label><input className="input" type="number" value={plowCost} onChange={e => setPlowCost(Number(e.target.value))} /></div>
              <div><label className="label">Shoveling — Client Rate ($/hr)</label><input className="input" type="number" value={shovRate} onChange={e => setShovRate(Number(e.target.value))} /></div>
              <div><label className="label">Shoveling — Your Cost ($/hr)</label><input className="input" type="number" value={shovCost} onChange={e => setShovCost(Number(e.target.value))} /></div>
              <div><label className="label">De-icing — Client Rate ($/bag)</label><input className="input" type="number" value={deicRate} onChange={e => setDeicRate(Number(e.target.value))} /></div>
              <div><label className="label">De-icing — Your Cost ($/bag)</label><input className="input" type="number" value={deicCost} onChange={e => setDeicCost(Number(e.target.value))} /></div>
            </div>
            <button className="btn-primary w-full" onClick={() => setShowRateEdit(false)}>Apply Rates</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
