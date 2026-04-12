import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppData, Contract, ContractStatus, EstimateLineItem } from '../types';
import { formatCurrency, formatPercent } from '../utils/calculations';
import { saveData } from '../utils/storage';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const STATUS_BADGE: Record<ContractStatus, string> = {
  estimate:          'badge-yellow',
  draft:             'badge-gray',
  awaiting_response: 'badge-yellow',
  changes_requested: 'badge-orange',
  approved:          'badge-green',
  active:            'badge-green',
  closed:            'badge-gray',
  lost:              'badge-red',
  converted:         'badge-green',
  rejected:          'badge-red',
};

const STATUS_LABELS: Record<ContractStatus, string> = {
  estimate:          'Estimate',
  draft:             'Draft',
  awaiting_response: 'Awaiting Response',
  changes_requested: 'Changes Requested',
  approved:          'Approved',
  active:            'Active',
  closed:            'Closed',
  lost:              'Lost',
  converted:         'Converted',
  rejected:          'Rejected',
};

interface Props { data: AppData; setData: (d: AppData) => void }

function lineItemMargin(item: EstimateLineItem) {
  const rev  = item.qty * item.unitPrice;
  const cost = item.qty * item.unitCost;
  return rev > 0 ? ((rev - cost) / rev) * 100 : 0;
}

export default function Contracts({ data, setData }: Props) {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<ContractStatus | 'all'>('all');
  const [viewContract, setViewContract] = useState<Contract | null>(null);

  const filtered = data.contracts.filter(c => filterStatus === 'all' || c.status === filterStatus);

  function updateStatus(id: string, status: ContractStatus) {
    const updated = { ...data, contracts: data.contracts.map(c => c.id === id ? { ...c, status } : c) };
    setData(updated); saveData(updated);
    if (viewContract?.id === id) setViewContract(prev => prev ? { ...prev, status } : null);
  }

  function deleteContract(id: string) {
    if (!confirm('Delete this contract/estimate?')) return;
    const updated = { ...data, contracts: data.contracts.filter(c => c.id !== id) };
    setData(updated); saveData(updated);
    setViewContract(null);
  }

  const totalMonthlyActive = data.contracts.filter(c => c.status === 'active').reduce((s, c) => s + c.monthlyRevenue, 0);
  const totalAnnualActive  = data.contracts.filter(c => c.status === 'active').reduce((s, c) => s + c.annualRevenue, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Contracts & Estimates"
        subtitle="Track all your bids, estimates, and active maintenance contracts"
        action={
          <button className="btn-primary" onClick={() => navigate('/estimator')}>+ New Estimate</button>
        }
      />

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['all','active','estimate'] as const).map(s => {
          const count = s === 'all' ? data.contracts.length : data.contracts.filter(c => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`p-3 rounded-xl border text-left transition-all ${
                filterStatus === s ? 'border-[#27AE60] bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <p className="text-xs text-gray-500 capitalize">{s === 'all' ? 'All Contracts' : STATUS_LABELS[s]}</p>
              <p className="text-xl font-bold text-gray-900">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Revenue summary */}
      <div className="card mb-6 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500">Monthly Recurring Revenue (Active)</p>
          <p className="text-2xl font-bold text-[#27AE60]">{formatCurrency(totalMonthlyActive)}/mo</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Annual Contract Value</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAnnualActive)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Annual</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Margin</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-400">
                  No contracts found. <button className="text-[#27AE60] hover:underline" onClick={() => navigate('/estimator')}>Create one →</button>
                </td>
              </tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewContract(c)}>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.estimateNumber}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{c.clientName}</p>
                  <p className="text-xs text-gray-400">{c.address}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={c.propertyType === 'commercial' ? 'badge-green' : 'badge-gray'}>{c.propertyType}</span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(c.monthlyRevenue)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(c.annualRevenue)}</td>
                <td className={`px-4 py-3 text-right font-medium ${c.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                  {formatPercent(c.grossMargin)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={STATUS_BADGE[c.status]}>{STATUS_LABELS[c.status]}</span>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <select
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-600"
                    value={c.status}
                    onChange={e => updateStatus(c.id, e.target.value as ContractStatus)}
                  >
                    <option value="estimate">Estimate</option>
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                    <option value="lost">Lost</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {viewContract && (
        <Modal title={`${viewContract.estimateNumber} · ${viewContract.clientName}`} onClose={() => setViewContract(null)} size="lg">
          <div className="space-y-5">

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">Property Type</p>
                <p className="font-medium capitalize">{viewContract.propertyType}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Address</p>
                <p className="font-medium">{viewContract.address || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Turf Area</p>
                <p className="font-medium">{viewContract.turfSF.toLocaleString()} sq ft</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Visits / Month</p>
                <p className="font-medium">{viewContract.visitsPerMonth}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Active Months</p>
                <p className="font-medium">{viewContract.activeMonths.length} months ({viewContract.activeMonths.join(', ')})</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Start Date</p>
                <p className="font-medium">{viewContract.startDate || '—'}</p>
              </div>
            </div>

            {/* Financial summary */}
            <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4">
              <div className="text-center">
                <p className="text-xs text-gray-500">Monthly Revenue</p>
                <p className="text-xl font-bold text-[#27AE60]">{formatCurrency(viewContract.monthlyRevenue)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Monthly Cost</p>
                <p className="text-xl font-bold text-amber-600">{formatCurrency(viewContract.totalCost)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Gross Margin</p>
                <p className={`text-xl font-bold ${viewContract.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                  {formatPercent(viewContract.grossMargin)}
                </p>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</p>
              {viewContract.lineItems.length === 0 ? (
                <p className="text-sm text-gray-400">No line items on this estimate.</p>
              ) : (
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Service</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                        <th className="text-left  px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                        <th className="text-right px-3 py-2 font-semibold text-amber-600 uppercase tracking-wide">My Cost</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Subtotal</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {viewContract.lineItems.filter(i => !i.optional).map(item => {
                        const subtotal = item.qty * item.unitPrice;
                        const margin   = lineItemMargin(item);
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <p className="font-medium text-gray-900">{item.name}</p>
                              {item.description && <p className="text-gray-400">{item.description}</p>}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{item.qty}</td>
                            <td className="px-3 py-2 text-gray-500">{item.unit}</td>
                            <td className="px-3 py-2 text-right text-amber-600 font-medium">{formatCurrency(item.unitCost)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(item.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(subtotal)}</td>
                            <td className={`px-3 py-2 text-right font-medium ${margin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                              {formatPercent(margin)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={3} className="px-3 py-2 font-semibold text-gray-700 text-xs uppercase">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-600">
                          {formatCurrency(viewContract.lineItems.filter(i=>!i.optional).reduce((s,i)=>s+i.qty*i.unitCost,0))}
                        </td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right font-bold text-[#27AE60]">
                          {formatCurrency(viewContract.subtotalRevenue)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${viewContract.grossMargin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                          {formatPercent(viewContract.grossMargin)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Optional items */}
              {viewContract.lineItems.some(i => i.optional) && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-1 italic">Optional / add-on services</p>
                  <div className="flex flex-wrap gap-1">
                    {viewContract.lineItems.filter(i => i.optional).map(item => (
                      <span key={item.id} className="badge-gray">{item.name} (+{formatCurrency(item.qty * item.unitPrice)})</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {viewContract.notes && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{viewContract.notes}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t">
              <select
                className="input flex-1"
                value={viewContract.status}
                onChange={e => updateStatus(viewContract.id, e.target.value as ContractStatus)}
              >
                <option value="estimate">Estimate</option>
                <option value="active">Active Contract</option>
                <option value="closed">Closed</option>
                <option value="lost">Lost</option>
              </select>
              <button className="btn-secondary" onClick={() => navigate('/estimator')}>Edit in Estimator</button>
              <button className="btn-danger" onClick={() => deleteContract(viewContract.id)}>Delete</button>
              <button className="btn-secondary" onClick={() => setViewContract(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
