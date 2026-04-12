import { useState, useEffect } from 'react';
import type { AppData, Invoice, InvoiceStatus, EstimateLineItem } from '../types';
import { calcLineItemTotals } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency, generateEstimateNumber } from '../utils/calculations';
import { getQBOStatus, pushInvoiceToQBO, syncFromQBO, disconnectQBO } from '../utils/qboApi';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'badge-gray', sent: 'badge-yellow', paid: 'badge-green', overdue: 'badge-red', void: 'badge-gray',
};
const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', void: 'Void',
};

function uid() { return `il_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

export default function Invoices({ data, setData }: Props) {
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all');
  const [viewInvoice, setViewInvoice]   = useState<Invoice | null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [showBatch, setShowBatch]       = useState(false);
  const [batchMonth, setBatchMonth]     = useState(new Date().getMonth());
  const [batchYear, setBatchYear]       = useState(new Date().getFullYear());

  // QBO state
  const [qboConnected, setQboConnected] = useState<boolean | null>(null); // null = loading
  const [qboSyncing, setQboSyncing]     = useState(false);
  const [qboPushing, setQboPushing]     = useState<string | null>(null); // invoice id being pushed

  useEffect(() => {
    getQBOStatus().then(r => setQboConnected(r.connected)).catch(() => setQboConnected(false));
  }, []);

  // Create form state
  const [createSource, setCreateSource]           = useState<'contract' | 'snow' | 'manual'>('contract');
  const [selectedContractId, setSelectedContractId] = useState('');
  const [selectedSnowIds, setSelectedSnowIds]     = useState<string[]>([]);
  const [manualClient, setManualClient]           = useState('');
  const [invoiceNotes, setInvoiceNotes]           = useState('Net 30. Late payment: 1.5%/month (18% annual).');
  const [dueInDays, setDueInDays]                 = useState(data.settings.defaultPaymentTermsDays || 30);

  async function handleSyncFromQBO() {
    const qboIds = data.invoices.filter(i => i.qboInvoiceId).map(i => i.qboInvoiceId!);
    if (qboIds.length === 0) { alert('No invoices have been pushed to QuickBooks yet.'); return; }
    setQboSyncing(true);
    try {
      const results = await syncFromQBO(qboIds);
      const now = new Date().toISOString();
      const updatedInvoices = data.invoices.map(inv => {
        if (!inv.qboInvoiceId) return inv;
        const r = results[inv.qboInvoiceId] as { qboStatus: string; balance: number; error?: string } | undefined;
        if (!r || r.error) return inv;
        const updates: Partial<Invoice> = { qboStatus: r.qboStatus, qboSyncedAt: now };
        if (r.qboStatus === 'paid') {
          updates.status    = 'paid';
          updates.paidDate  = new Date().toISOString().split('T')[0];
          updates.paidAmount = inv.total;
        }
        return { ...inv, ...updates };
      });
      const updated = { ...data, invoices: updatedInvoices };
      setData(updated); saveData(updated);
      if (viewInvoice) {
        const refreshed = updatedInvoices.find(i => i.id === viewInvoice.id);
        if (refreshed) setViewInvoice(refreshed);
      }
    } catch (err: unknown) {
      alert(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setQboSyncing(false);
    }
  }

  async function handlePushToQBO(invoice: Invoice) {
    setQboPushing(invoice.id);
    try {
      const client = data.clients.find(c => c.id === invoice.clientId);
      const prop   = client?.properties?.find(p => p.isBillingAddress) ?? client?.properties?.[0];
      const clientAddress = prop
        ? [prop.street1, prop.city, prop.state, prop.zip].filter(Boolean).join(', ')
        : '';
      const result = await pushInvoiceToQBO(invoice, clientAddress);
      const updatedInvoices = data.invoices.map(i =>
        i.id === invoice.id
          ? { ...i, qboInvoiceId: result.qboInvoiceId, qboCustomerId: result.qboCustomerId, qboDocNumber: result.qboDocNumber }
          : i
      );
      const updated = { ...data, invoices: updatedInvoices };
      setData(updated); saveData(updated);
      if (viewInvoice?.id === invoice.id) {
        setViewInvoice({ ...viewInvoice, qboInvoiceId: result.qboInvoiceId, qboCustomerId: result.qboCustomerId, qboDocNumber: result.qboDocNumber });
      }
    } catch (err: unknown) {
      alert(`Push to QuickBooks failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setQboPushing(null);
    }
  }

  async function handleDisconnectQBO() {
    if (!confirm('Disconnect from QuickBooks Online?')) return;
    try {
      await disconnectQBO();
      setQboConnected(false);
    } catch (err: unknown) {
      alert(`Disconnect failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function toggleSnow(id: string) {
    setSelectedSnowIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function createInvoice() {
    let clientName = '';
    let lineItems: EstimateLineItem[] = [];
    let contractId: string | undefined;
    let snowTripIds: string[] = [];

    if (createSource === 'contract') {
      const c = data.contracts.find(x => x.id === selectedContractId);
      if (!c) { alert('Select a contract'); return; }
      clientName = c.clientName;
      contractId = c.id;
      lineItems  = c.lineItems.filter(i => !i.optional);
    } else if (createSource === 'snow') {
      if (selectedSnowIds.length === 0) { alert('Select at least one snow trip'); return; }
      const trips = data.snowTrips.filter(t => selectedSnowIds.includes(t.id));
      clientName   = trips[0].clientName;
      snowTripIds  = selectedSnowIds;
      lineItems    = trips.flatMap(t => {
        const items: EstimateLineItem[] = [];
        const sr = data.settings;
        if (t.plowingHours > 0)   items.push({ id: uid(), name: `Snow Plowing — ${t.serviceDate}`,    description: `${t.snowfallInches || 0}" snowfall`,  qty: t.plowingHours,   unit: 'hour', unitCost: sr.plowingCostPerHour,   unitPrice: sr.plowingRatePerHour,   optional: false, taxable: false, notes: '' });
        if (t.shovelingHours > 0) items.push({ id: uid(), name: `Snow Shoveling — ${t.serviceDate}`,  description: '',                                     qty: t.shovelingHours, unit: 'hour', unitCost: sr.shovelingCostPerHour, unitPrice: sr.shovelingRatePerHour, optional: false, taxable: false, notes: '' });
        if (t.deicingBags > 0)    items.push({ id: uid(), name: `De-icing Material — ${t.serviceDate}`,description: '',                                     qty: t.deicingBags,    unit: 'bag',  unitCost: sr.deicingCostPerBag,    unitPrice: sr.deicingRatePerBag,    optional: false, taxable: false, notes: '' });
        return items;
      });
    } else {
      if (!manualClient.trim()) { alert('Enter a client name'); return; }
      clientName = manualClient;
    }

    const { subtotalRevenue: subtotal } = calcLineItemTotals(lineItems);
    const taxRate   = data.settings.defaultTaxRate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total     = subtotal + taxAmount;
    const counter   = (data.invoiceCounter ?? 1) + 1;
    const today     = new Date().toISOString().split('T')[0];
    const due       = new Date(); due.setDate(due.getDate() + dueInDays);

    const invoice: Invoice = {
      id: `inv_${Date.now()}`, invoiceNumber: `INV-${generateEstimateNumber(counter)}`,
      clientId: data.clients.find(c => c.name === clientName)?.id,
      clientName, contractId, snowTripIds, lineItems,
      subtotal, taxRate, taxAmount, discountAmount: 0, total,
      status: 'draft', issuedDate: today, dueDate: due.toISOString().split('T')[0],
      paidDate: '', paidAmount: 0, notes: invoiceNotes, createdAt: new Date().toISOString(),
    };

    const updatedTrips = data.snowTrips.map(t =>
      snowTripIds.includes(t.id) ? { ...t, status: 'invoiced' as const, invoiceId: invoice.id } : t
    );

    const updated: AppData = { ...data, invoiceCounter: counter, invoices: [invoice, ...data.invoices], snowTrips: updatedTrips };
    setData(updated); saveData(updated);
    setShowCreate(false); setViewInvoice(invoice);
    setSelectedContractId(''); setSelectedSnowIds([]); setManualClient('');
  }

  function updateStatus(id: string, status: InvoiceStatus) {
    const paidDate  = status === 'paid' ? new Date().toISOString().split('T')[0] : '';
    const paidAmount = status === 'paid' ? (data.invoices.find(i => i.id === id)?.total ?? 0) : 0;
    const updated = { ...data, invoices: data.invoices.map(i => i.id === id ? { ...i, status, paidDate, paidAmount } : i) };
    setData(updated); saveData(updated);
    setViewInvoice(prev => prev?.id === id ? { ...prev, status, paidDate, paidAmount } : prev);
  }

  function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return;
    const updated = { ...data, invoices: data.invoices.filter(i => i.id !== id) };
    setData(updated); saveData(updated); setViewInvoice(null);
  }

  // Batch snow invoicing
  const batchCandidates = data.snowTrips.filter(t => {
    if (t.status === 'invoiced' || t.status === 'paid') return false;
    const d = new Date(t.serviceDate + 'T12:00:00'); // noon to avoid timezone off-by-one
    return d.getMonth() === batchMonth && d.getFullYear() === batchYear;
  });
  const batchByClient = batchCandidates.reduce<Record<string, typeof batchCandidates>>((acc, trip) => {
    if (!acc[trip.clientName]) acc[trip.clientName] = [];
    acc[trip.clientName].push(trip);
    return acc;
  }, {});

  function createBatchInvoices() {
    const groups = Object.entries(batchByClient);
    if (groups.length === 0) { alert('No uninvoiced snow trips for that month.'); return; }
    let counter = data.invoiceCounter ?? 1;
    const newInvoices: Invoice[] = [];
    const invoicedTripIds: string[] = [];
    const today = new Date().toISOString().split('T')[0];
    const due   = new Date(); due.setDate(due.getDate() + dueInDays);
    const dueStr = due.toISOString().split('T')[0];
    const taxRate = data.settings.defaultTaxRate || 0;

    for (const [clientName, trips] of groups) {
      counter++;
      const sr = data.settings;
      const lineItems: EstimateLineItem[] = trips.flatMap(t => {
        const items: EstimateLineItem[] = [];
        if (t.plowingHours > 0)   items.push({ id: uid(), name: `Snow Plowing — ${t.serviceDate}`,     description: `${t.snowfallInches || 0}" snowfall`, qty: t.plowingHours,   unit: 'hour', unitCost: sr.plowingCostPerHour,   unitPrice: sr.plowingRatePerHour,   optional: false, taxable: false, notes: '' });
        if (t.shovelingHours > 0) items.push({ id: uid(), name: `Snow Shoveling — ${t.serviceDate}`,   description: '',                                   qty: t.shovelingHours, unit: 'hour', unitCost: sr.shovelingCostPerHour, unitPrice: sr.shovelingRatePerHour, optional: false, taxable: false, notes: '' });
        if (t.deicingBags > 0)    items.push({ id: uid(), name: `De-icing Material — ${t.serviceDate}`, description: '',                                   qty: t.deicingBags,    unit: 'bag',  unitCost: sr.deicingCostPerBag,    unitPrice: sr.deicingRatePerBag,    optional: false, taxable: false, notes: '' });
        return items;
      });
      const { subtotalRevenue: subtotal } = calcLineItemTotals(lineItems);
      const taxAmount = subtotal * (taxRate / 100);
      const invoice: Invoice = {
        id: `inv_${Date.now()}_${counter}`,
        invoiceNumber: `INV-${generateEstimateNumber(counter)}`,
        clientId: data.clients.find(c => c.name === clientName)?.id,
        clientName, contractId: trips[0].jobId,
        snowTripIds: trips.map(t => t.id),
        lineItems, subtotal, taxRate, taxAmount, discountAmount: 0,
        total: subtotal + taxAmount,
        status: 'draft', issuedDate: today, dueDate: dueStr,
        paidDate: '', paidAmount: 0, notes: invoiceNotes,
        createdAt: new Date().toISOString(),
      };
      newInvoices.push(invoice);
      invoicedTripIds.push(...trips.map(t => t.id));
    }
    const updatedTrips = data.snowTrips.map(t =>
      invoicedTripIds.includes(t.id)
        ? { ...t, status: 'invoiced' as const, invoiceId: newInvoices.find(inv => inv.snowTripIds.includes(t.id))!.id }
        : t
    );
    const updated: AppData = { ...data, invoiceCounter: counter, invoices: [...newInvoices, ...data.invoices], snowTrips: updatedTrips };
    setData(updated); saveData(updated); setShowBatch(false);
  }

  const filtered = data.invoices.filter(i => filterStatus === 'all' || i.status === filterStatus);

  const totalOutstanding = data.invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const totalPaid        = data.invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.paidAmount, 0);
  const totalOverdue     = data.invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const totalDraft       = data.invoices.filter(i => i.status === 'draft').reduce((s, i) => s + i.total, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Invoices"
        subtitle="Track invoices, outstanding balances, and payment history"
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowBatch(true)}>Batch Invoice Snow</button>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Create Invoice</button>
          </div>
        }
      />

      {/* QBO connection banner */}
      {qboConnected === false && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3">
          <span className="text-sm font-medium text-yellow-800">QuickBooks not connected</span>
          <button
            className="btn-primary text-sm"
            onClick={() => {
              const url = `${import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001'}/auth/quickbooks`;
              const api = (window as any).electronAPI;
              if (api?.openExternal) api.openExternal(url);
              else window.open(url, '_blank');
            }}
          >
            Connect QuickBooks
          </button>
        </div>
      )}
      {qboConnected === true && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-green-300 bg-green-50 px-4 py-3">
          <span className="text-sm font-medium text-green-800">QuickBooks connected ✓</span>
          <div className="flex gap-2">
            <button
              className="btn-primary text-sm"
              onClick={handleSyncFromQBO}
              disabled={qboSyncing}
            >
              {qboSyncing ? 'Syncing…' : 'Sync from QBO'}
            </button>
            <button
              className="btn-secondary text-sm"
              onClick={handleDisconnectQBO}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Outstanding', value: totalOutstanding, count: data.invoices.filter(i=>i.status==='sent').length + ' sent',  color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
          { label: 'Overdue',     value: totalOverdue,     count: data.invoices.filter(i=>i.status==='overdue').length + ' overdue', color: 'bg-red-50 border-red-200 text-red-800' },
          { label: 'Collected',   value: totalPaid,        count: data.invoices.filter(i=>i.status==='paid').length + ' paid',   color: 'bg-green-50 border-green-200 text-green-800' },
          { label: 'Drafts',      value: totalDraft,       count: data.invoices.filter(i=>i.status==='draft').length + ' drafts', color: 'bg-gray-50 border-gray-200 text-gray-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(s.value)}</p>
            <p className="text-xs opacity-60 mt-0.5">{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all','draft','sent','paid','overdue','void'] as const).map(s => {
          const count = s === 'all' ? data.invoices.length : data.invoices.filter(i => i.status === s).length;
          return (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-[#27AE60] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'all' ? 'All' : STATUS_LABELS[s as InvoiceStatus]} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No invoices found.</p>
            <button className="btn-primary mt-4 text-sm" onClick={() => setShowCreate(true)}>Create your first invoice</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Invoice #','Client','Issued','Due','Amount','Margin','Status','QBO',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(inv => {
                const cost   = inv.lineItems.reduce((s, i) => s + i.qty * i.unitCost, 0);
                const margin = inv.total > 0 ? ((inv.total - cost) / inv.total * 100) : 0;
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewInvoice(inv)}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{inv.clientName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{inv.issuedDate}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{inv.dueDate}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(inv.total)}</td>
                    <td className={`px-4 py-3 text-sm font-medium ${margin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                      {margin > 0 ? `${margin.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-4 py-3"><span className={STATUS_BADGE[inv.status]}>{STATUS_LABELS[inv.status]}</span></td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {inv.qboInvoiceId ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                          QBO: {inv.qboStatus ? inv.qboStatus.charAt(0).toUpperCase() + inv.qboStatus.slice(1) : 'Synced'}
                        </span>
                      ) : qboConnected ? (
                        <button
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                          disabled={qboPushing === inv.id}
                          onClick={() => handlePushToQBO(inv)}
                        >
                          {qboPushing === inv.id ? 'Pushing…' : '↑ Push'}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <select className="text-xs border border-gray-200 rounded px-1 py-0.5" value={inv.status}
                        onChange={e => updateStatus(inv.id, e.target.value as InvoiceStatus)}>
                        {(['draft','sent','paid','overdue','void'] as InvoiceStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Invoice Detail Modal ────────────────────────────────────── */}
      {viewInvoice && (
        <Modal title={`${viewInvoice.invoiceNumber} · ${viewInvoice.clientName}`} onClose={() => setViewInvoice(null)} size="xl">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-gray-400">Client</p><p className="font-semibold">{viewInvoice.clientName}</p></div>
              <div><p className="text-xs text-gray-400">Issued</p><p>{viewInvoice.issuedDate}</p></div>
              <div><p className="text-xs text-gray-400">Due</p><p className={viewInvoice.status === 'overdue' ? 'text-red-600 font-semibold' : ''}>{viewInvoice.dueDate}</p></div>
            </div>

            {viewInvoice.lineItems.length > 0 && (
              <table className="w-full text-sm border border-gray-100 rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs text-gray-500">Service</th>
                    <th className="text-left px-4 py-2.5 text-xs text-gray-500">Description</th>
                    <th className="text-center px-3 py-2.5 text-xs text-gray-500">Qty</th>
                    <th className="text-center px-3 py-2.5 text-xs text-gray-500">Unit</th>
                    <th className="text-right px-3 py-2.5 text-xs text-amber-600">Your Cost</th>
                    <th className="text-right px-4 py-2.5 text-xs text-gray-700">Price/Unit</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {viewInvoice.lineItems.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-medium">{item.name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{item.description}</td>
                      <td className="px-3 py-2.5 text-center">{item.qty}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{item.unit}</td>
                      <td className="px-3 py-2.5 text-right text-amber-600 text-xs">{formatCurrency(item.qty * item.unitCost)}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(item.qty * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={4} className="px-4 py-3 text-xs text-gray-500">
                      Cost basis: <span className="text-amber-600 font-semibold">{formatCurrency(viewInvoice.lineItems.reduce((s,i)=>s+i.qty*i.unitCost,0))}</span>
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-3 text-right text-xl font-bold text-gray-900">{formatCurrency(viewInvoice.total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {viewInvoice.status === 'paid' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                ✓ Paid {viewInvoice.paidDate} — {formatCurrency(viewInvoice.paidAmount)}
              </div>
            )}
            {viewInvoice.notes && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
                <p className="text-xs text-gray-400 mb-1">Notes / Terms</p>
                {viewInvoice.notes}
              </div>
            )}

            {/* QBO section */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              {viewInvoice.qboInvoiceId ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-700">QuickBooks: </span>
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200 ml-1">
                      {viewInvoice.qboStatus ? viewInvoice.qboStatus.charAt(0).toUpperCase() + viewInvoice.qboStatus.slice(1) : 'Synced'}
                    </span>
                    {viewInvoice.qboDocNumber && <span className="ml-2 text-xs text-gray-400">#{viewInvoice.qboDocNumber}</span>}
                    {viewInvoice.qboSyncedAt && <span className="ml-2 text-xs text-gray-400">Last synced: {new Date(viewInvoice.qboSyncedAt).toLocaleDateString()}</span>}
                  </div>
                  {qboConnected && (
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      onClick={handleSyncFromQBO}
                      disabled={qboSyncing}
                    >
                      {qboSyncing ? 'Syncing…' : 'Sync now'}
                    </button>
                  )}
                </div>
              ) : qboConnected ? (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Not yet pushed to QuickBooks</span>
                  <button
                    className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
                    disabled={qboPushing === viewInvoice.id}
                    onClick={() => handlePushToQBO(viewInvoice)}
                  >
                    {qboPushing === viewInvoice.id ? 'Pushing…' : '↑ Push to QuickBooks'}
                  </button>
                </div>
              ) : (
                <span className="text-gray-400 text-xs">Connect QuickBooks to push invoices</span>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t">
              <div className="flex-1">
                <label className="label">Update Status</label>
                <select className="input" value={viewInvoice.status}
                  onChange={e => updateStatus(viewInvoice.id, e.target.value as InvoiceStatus)}>
                  {(['draft','sent','paid','overdue','void'] as InvoiceStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button className="btn-danger" onClick={() => deleteInvoice(viewInvoice.id)}>Delete</button>
                <button className="btn-secondary" onClick={() => setViewInvoice(null)}>Close</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Batch Snow Invoice Modal ─────────────────────────────────── */}
      {showBatch && (
        <Modal title="Batch Invoice Snow Trips" onClose={() => setShowBatch(false)} size="lg">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Month</label>
                <select className="input" value={batchMonth} onChange={e => setBatchMonth(Number(e.target.value))}>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <input className="input" type="number" value={batchYear} onChange={e => setBatchYear(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <p className="label mb-2">Uninvoiced Trips for {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][batchMonth]} {batchYear}</p>
              {Object.keys(batchByClient).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No uninvoiced snow trips for this month.</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {Object.entries(batchByClient).map(([client, trips]) => (
                    <div key={client} className="border border-gray-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-gray-900 mb-1">
                        {client}
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          → {trips.length} trip{trips.length !== 1 ? 's' : ''} · {formatCurrency(trips.reduce((s, t) => s + (t.plowingHours * data.settings.plowingRatePerHour) + (t.shovelingHours * data.settings.shovelingRatePerHour) + (t.deicingBags * data.settings.deicingRatePerBag), 0))}
                        </span>
                      </p>
                      <div className="space-y-0.5">
                        {trips.map(t => (
                          <p key={t.id} className="text-xs text-gray-500">
                            {t.serviceDate} — {t.propertyAddress} — {formatCurrency((t.plowingHours * data.settings.plowingRatePerHour) + (t.shovelingHours * data.settings.shovelingRatePerHour) + (t.deicingBags * data.settings.deicingRatePerBag))}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Payment Terms (days)</label>
                <input className="input" type="number" value={dueInDays} onChange={e => setDueInDays(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t">
              <button
                className="btn-primary flex-1 disabled:opacity-50"
                onClick={createBatchInvoices}
                disabled={Object.keys(batchByClient).length === 0}
              >
                Create {Object.keys(batchByClient).length} Invoice{Object.keys(batchByClient).length !== 1 ? 's' : ''}
              </button>
              <button className="btn-secondary" onClick={() => setShowBatch(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Create Invoice Modal ────────────────────────────────────── */}
      {showCreate && (
        <Modal title="Create Invoice" onClose={() => setShowCreate(false)} size="lg">
          <div className="space-y-5">
            {/* Source */}
            <div>
              <label className="label">Invoice Source</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'contract', label: 'Monthly Contract', desc: 'Bill for a maintenance contract' },
                  { key: 'snow',     label: 'Snow Trips',       desc: 'Bill per-trip snow events' },
                  { key: 'manual',   label: 'Manual / Custom',  desc: 'Enter line items manually' },
                ] as const).map(s => (
                  <button key={s.key} onClick={() => setCreateSource(s.key)}
                    className={`p-3 rounded-xl border text-left transition-all ${createSource === s.key ? 'border-[#27AE60] bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Contract picker */}
            {createSource === 'contract' && (
              <div>
                <label className="label">Select Contract</label>
                <select className="input" value={selectedContractId} onChange={e => setSelectedContractId(e.target.value)}>
                  <option value="">Choose a contract...</option>
                  {data.contracts.filter(c => c.status === 'active').map(c => (
                    <option key={c.id} value={c.id}>{c.clientName} — {formatCurrency(c.monthlyRevenue)}/mo</option>
                  ))}
                </select>
                {selectedContractId && (() => {
                  const c = data.contracts.find(x => x.id === selectedContractId)!;
                  return <p className="text-xs text-gray-500 mt-1">{c.lineItems.filter(i=>!i.optional).length} line items · {formatCurrency(c.subtotalRevenue)} subtotal</p>;
                })()}
              </div>
            )}

            {/* Snow trips */}
            {createSource === 'snow' && (
              <div>
                <label className="label">Select Snow Trips to Invoice</label>
                <div className="space-y-1.5 max-h-52 overflow-y-auto border border-gray-200 rounded-xl p-2">
                  {data.snowTrips.filter(t => t.status !== 'paid').length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No un-invoiced snow trips found.<br />Log trips in the Snow Removal page first.</p>
                  ) : data.snowTrips.filter(t => t.status !== 'paid').map(t => (
                    <label key={t.id} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={selectedSnowIds.includes(t.id)} onChange={() => toggleSnow(t.id)} className="accent-[#27AE60] w-4 h-4" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{t.clientName} — {t.serviceDate}</p>
                        <p className="text-xs text-gray-400">
                          {t.snowfallInches > 0 ? `${t.snowfallInches}" · ` : ''}
                          {t.plowingHours > 0 ? `${t.plowingHours}hr plow ` : ''}
                          {t.shovelingHours > 0 ? `${t.shovelingHours}hr shovel ` : ''}
                          {t.deicingBags > 0 ? `${t.deicingBags} bags` : ''}
                        </p>
                      </div>
                      <span className="font-bold text-sm text-gray-900">{formatCurrency((t.plowingHours * data.settings.plowingRatePerHour) + (t.shovelingHours * data.settings.shovelingRatePerHour) + (t.deicingBags * data.settings.deicingRatePerBag))}</span>
                    </label>
                  ))}
                </div>
                {selectedSnowIds.length > 0 && (
                  <p className="text-sm font-semibold text-[#27AE60] mt-2">
                    {selectedSnowIds.length} trips · Total: {formatCurrency(data.snowTrips.filter(t=>selectedSnowIds.includes(t.id)).reduce((s,t)=>s+(t.plowingHours*data.settings.plowingRatePerHour)+(t.shovelingHours*data.settings.shovelingRatePerHour)+(t.deicingBags*data.settings.deicingRatePerBag),0))}
                  </p>
                )}
              </div>
            )}

            {/* Manual */}
            {createSource === 'manual' && (
              <div>
                <label className="label">Client Name *</label>
                <input className="input" value={manualClient} onChange={e => setManualClient(e.target.value)} placeholder="Client name" />
                <p className="text-xs text-gray-400 mt-1">The invoice will be created as a draft — you can add line items by editing after creation.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Payment Terms (days due)</label>
                <input className="input" type="number" value={dueInDays} onChange={e => setDueInDays(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label">Notes / Payment Terms</label>
              <textarea className="input resize-none" rows={2} value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} />
            </div>

            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={createInvoice}>Create Invoice</button>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
