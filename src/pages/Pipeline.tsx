import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppData, PipelineLead, PipelineStage, Contract } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

interface Props { data: AppData; setData: (d: AppData) => void }

function blankLead(stage: PipelineStage = 'lead'): Omit<PipelineLead, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '', type: 'commercial', contactName: '', phone: '', email: '',
    address: '', city: '', state: 'MN', estimatedValue: 0,
    stage, source: '', notes: '', followUpDate: '',
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Lead Tile ──────────────────────────────────────────────────────────────────
function LeadTile({ lead, today, onEdit, children }: {
  lead: PipelineLead;
  today: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const overdue = lead.followUpDate && lead.followUpDate < today;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
      <div className="cursor-pointer mb-3" onClick={onEdit}>
        <div className="flex items-start justify-between mb-1.5">
          <p className="font-semibold text-gray-900 text-sm leading-tight">{lead.name}</p>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${lead.type === 'commercial' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {lead.type === 'commercial' ? 'Comm' : 'Res'}
          </span>
        </div>
        {lead.contactName && <p className="text-xs text-gray-500 mb-0.5">👤 {lead.contactName}</p>}
        {lead.phone && <p className="text-xs text-gray-500 mb-0.5">📞 {lead.phone}</p>}
        {lead.estimatedValue > 0 && (
          <p className="text-sm font-bold text-[#27AE60]">{formatCurrency(lead.estimatedValue)}/mo est.</p>
        )}
        {lead.followUpDate && (
          <p className={`text-xs mt-1 ${overdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
            {overdue ? '⚠ Overdue · ' : '📅 '}{lead.followUpDate}
          </p>
        )}
        {lead.source && <p className="text-xs text-gray-400 italic mt-0.5">{lead.source}</p>}
        <p className="text-xs text-gray-300 mt-1.5">Tap to edit details</p>
      </div>
      <div className="border-t border-gray-100 pt-2">
        {children}
      </div>
    </div>
  );
}

// ── Column Header ──────────────────────────────────────────────────────────────
function ColHeader({ label, count, dot, onAdd }: {
  label: string; count: number; dot: string; onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
        <span className="text-sm font-bold text-gray-700">{label}</span>
        <span className="text-xs font-semibold text-gray-400 bg-white rounded-full px-1.5 py-0.5 border">{count}</span>
      </div>
      {onAdd && (
        <button onClick={onAdd} className="text-gray-400 hover:text-[#27AE60] text-xl leading-none font-bold w-6 h-6 flex items-center justify-center rounded hover:bg-white/60 transition-colors">+</button>
      )}
    </div>
  );
}

// ── Lead Form ──────────────────────────────────────────────────────────────────
function LeadForm({
  form, setForm,
}: {
  form: Omit<PipelineLead, 'id' | 'createdAt' | 'updatedAt'>;
  setForm: (f: Omit<PipelineLead, 'id' | 'createdAt' | 'updatedAt'>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Company / Name *</label>
          <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Lakewood HOA" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={e => setForm({...form, type: e.target.value as PipelineLead['type']})}>
            <option value="commercial">Commercial</option>
            <option value="residential">Residential</option>
          </select>
        </div>
        <div>
          <label className="label">Stage</label>
          <select className="input" value={form.stage} onChange={e => setForm({...form, stage: e.target.value as PipelineStage})}>
            <option value="lead">New Lead</option>
            <option value="contacted">Contacted</option>
            <option value="site_visit">Site Visit</option>
          </select>
        </div>
        <div>
          <label className="label">Contact Name</label>
          <input className="input" value={form.contactName} onChange={e => setForm({...form, contactName: e.target.value})} placeholder="Property manager..." />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(612) 555-0100" />
        </div>
        <div className="col-span-2">
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
        </div>
        <div className="col-span-2">
          <label className="label">Property Address</label>
          <input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Street address" />
        </div>
        <div>
          <label className="label">City</label>
          <input className="input" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
        </div>
        <div>
          <label className="label">State</label>
          <input className="input" value={form.state} onChange={e => setForm({...form, state: e.target.value})} />
        </div>
        <div>
          <label className="label">Est. Monthly Value ($)</label>
          <input className="input" type="number" value={form.estimatedValue || ''} onChange={e => setForm({...form, estimatedValue: Number(e.target.value)})} placeholder="0" />
        </div>
        <div>
          <label className="label">Follow-up Date</label>
          <input className="input" type="date" value={form.followUpDate} onChange={e => setForm({...form, followUpDate: e.target.value})} />
        </div>
        <div className="col-span-2">
          <label className="label">Lead Source</label>
          <input className="input" value={form.source} onChange={e => setForm({...form, source: e.target.value})} placeholder="Referral, Google, Door knock, Signage..." />
        </div>
        <div className="col-span-2">
          <label className="label">Notes</label>
          <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Property details, budget, timing..." />
        </div>
      </div>
    </div>
  );
}

// ── Main Pipeline ──────────────────────────────────────────────────────────────
export default function Pipeline({ data, setData }: Props) {
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStage, setAddStage]         = useState<PipelineStage>('lead');
  const [form, setForm]                 = useState(blankLead());
  const [viewLead, setViewLead]         = useState<PipelineLead | null>(null);
  const [editForm, setEditForm]         = useState<Omit<PipelineLead,'id'|'createdAt'|'updatedAt'> | null>(null);
  const [activateData, setActivateData] = useState<{
    lead: PipelineLead | null;
    contract: Contract;
    schedDay: number;
    schedTime: string;
    schedDuration: number;
  } | null>(null);
  const [viewEstimate, setViewEstimate] = useState<Contract | null>(null);

  function persist(updated: AppData) { setData(updated); saveData(updated); }

  function importFromClient(clientId: string) {
    if (!clientId) return;
    const c = data.clients.find(x => x.id === clientId);
    if (!c) return;
    const prop = c.properties?.find(p => p.isBillingAddress) ?? c.properties?.[0];
    const contact = c.contacts?.find(ct => ct.isPrimary) ?? c.contacts?.[0];
    setForm(f => ({ ...f, name: c.companyName || c.name || '', type: c.type, contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : (c.contactName || ''), email: contact?.email || c.email || '', phone: contact?.phone || c.phone || '', address: prop?.street1 || c.billingAddress || '', city: prop?.city || c.city || '', state: prop?.state || c.state || '', clientId: c.id }));
  }

  function addLead() {
    if (!form.name.trim()) { alert('Name required'); return; }
    const now = new Date().toISOString();
    const lead: PipelineLead = { id: `lead_${Date.now()}`, ...form, createdAt: now, updatedAt: now };
    persist({ ...data, leads: [...data.leads, lead] });
    setShowAddModal(false); setForm(blankLead());
  }

  function saveLead() {
    if (!editForm || !viewLead) return;
    if (!editForm.name.trim()) { alert('Name required'); return; }
    const updated = data.leads.map(l => l.id === viewLead.id ? { ...l, ...editForm, updatedAt: new Date().toISOString() } : l);
    persist({ ...data, leads: updated });
    setViewLead(null); setEditForm(null);
  }

  function moveLead(id: string, stage: PipelineStage) {
    persist({ ...data, leads: data.leads.map(l => l.id === id ? { ...l, stage, updatedAt: new Date().toISOString() } : l) });
  }

  function removeLead(id: string) {
    if (!confirm('Remove this lead from the pipeline?')) return;
    persist({ ...data, leads: data.leads.filter(l => l.id !== id) });
    setViewLead(null); setEditForm(null);
  }

  function createEstimateFromLead(lead: PipelineLead) {
    navigate('/estimator', { state: {
      clientId: lead.clientId || '',
      clientName: lead.name,
      address: [lead.address, lead.city, lead.state].filter(Boolean).join(', '),
      propertyType: lead.type,
    }});
  }

  function sendEstimate(contract: Contract) {
    const sentAt = new Date().toISOString();
    persist({ ...data, contracts: data.contracts.map(c => c.id === contract.id ? { ...c, sentAt } : c) });
  }

  function lostEstimate(id: string) {
    if (!confirm('Mark this estimate as lost/rejected?')) return;
    persist({ ...data, contracts: data.contracts.map(c => c.id === id ? { ...c, status: 'lost' as const } : c) });
    setViewEstimate(null);
  }

  function findLinkedLead(contract: Contract): PipelineLead | null {
    return data.leads.find(l =>
      (contract.clientId && l.clientId === contract.clientId) ||
      l.name.toLowerCase() === contract.clientName.toLowerCase()
    ) ?? null;
  }

  function openActivateFromEstimate(contract: Contract) {
    setActivateData({
      lead: findLinkedLead(contract),
      contract,
      schedDay: contract.scheduledDay ?? 1,
      schedTime: contract.scheduledTime ?? '08:00',
      schedDuration: contract.scheduledDurationMinutes ?? 120,
    });
    setViewEstimate(null);
  }

  function doActivateJob() {
    if (!activateData) return;
    const { lead, contract, schedDay, schedTime, schedDuration } = activateData;
    if (!schedTime) { alert('Please set a start time.'); return; }
    const now = new Date().toISOString();
    const updatedContracts = data.contracts.map(c =>
      c.id === contract.id
        ? { ...c, status: 'active' as const, scheduledDay: schedDay, scheduledTime: schedTime, scheduledDurationMinutes: schedDuration }
        : c
    );
    const updatedLeads = lead
      ? data.leads.map(l => l.id === lead.id ? { ...l, stage: 'won' as PipelineStage, updatedAt: now } : l)
      : data.leads;
    persist({ ...data, contracts: updatedContracts, leads: updatedLeads });
    setActivateData(null);
    navigate('/projects');
  }

  // ── Derived data ──
  const today         = new Date().toISOString().split('T')[0];
  const newLeads      = data.leads.filter(l => l.stage === 'lead');
  const contactedLeads = data.leads.filter(l => l.stage === 'contacted');
  const siteLeads     = data.leads.filter(l => l.stage === 'site_visit');
  const openEstimates = data.contracts.filter(c => c.status === 'estimate' && !c.sentAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sentEstimates = data.contracts.filter(c => c.status === 'estimate' && !!c.sentAt)
    .sort((a, b) => b.sentAt!.localeCompare(a.sentAt!));
  const wonLeads      = data.leads.filter(l => l.stage === 'won');
  const lostContracts = data.contracts.filter(c => c.status === 'lost');

  const activeLeads   = data.leads.filter(l => !['won','lost','estimate_created','estimate_sent'].includes(l.stage));
  const totalPipeline = activeLeads.reduce((s, l) => s + l.estimatedValue, 0);
  const wonValue      = wonLeads.reduce((s, l) => s + l.estimatedValue, 0);
  const overdueCount  = activeLeads.filter(l => l.followUpDate && l.followUpDate < today).length;

  function openAdd(stage: PipelineStage) {
    setAddStage(stage); setForm(blankLead(stage)); setShowAddModal(true);
  }

  return (
    <div className="p-6 max-w-full">
      <PageHeader
        title="Sales Pipeline"
        subtitle="Track every lead from first contact to signed contract"
        action={<button className="btn-primary" onClick={() => openAdd('lead')}>+ Add Lead</button>}
      />

      {/* Stats bar */}
      <div className="flex gap-4 mb-8 flex-wrap">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Active Leads</p>
          <p className="text-2xl font-bold text-gray-900">{activeLeads.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Pipeline Value</p>
          <p className="text-2xl font-bold text-[#27AE60]">{formatCurrency(totalPipeline)}/mo</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 px-4 py-3">
          <p className="text-xs text-gray-500">Won Value</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(wonValue)}/mo</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Open Estimates</p>
          <p className="text-2xl font-bold text-gray-900">{openEstimates.length + sentEstimates.length}</p>
        </div>
        {overdueCount > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 px-4 py-3">
            <p className="text-xs text-gray-500">Overdue Follow-ups</p>
            <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
          </div>
        )}
      </div>

      {/* ── SECTION 1: Lead Pipeline ────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Lead Pipeline</h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* New Lead */}
          <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-3">
            <ColHeader label="New Lead" count={newLeads.length} dot="bg-gray-400"
              onAdd={() => openAdd('lead')} />
            <div className="space-y-2">
              {newLeads.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No new leads</p>}
              {newLeads.map(l => (
                <LeadTile key={l.id} lead={l} today={today}
                  onEdit={() => { setViewLead(l); setEditForm({...l}); }}>
                  <button
                    className="w-full text-xs py-1.5 px-2 bg-[#27AE60] text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    onClick={() => moveLead(l.id, 'contacted')}>
                    Contacted →
                  </button>
                </LeadTile>
              ))}
            </div>
          </div>

          {/* Contacted */}
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-3">
            <ColHeader label="Contacted" count={contactedLeads.length} dot="bg-blue-400"
              onAdd={() => openAdd('contacted')} />
            <div className="space-y-2">
              {contactedLeads.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No leads in contact</p>}
              {contactedLeads.map(l => (
                <LeadTile key={l.id} lead={l} today={today}
                  onEdit={() => { setViewLead(l); setEditForm({...l}); }}>
                  <div className="flex flex-col gap-1.5">
                    <button
                      className="w-full text-xs py-1.5 px-2 bg-[#27AE60] text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                      onClick={() => moveLead(l.id, 'site_visit')}>
                      Schedule Site Visit →
                    </button>
                    <button
                      className="w-full text-xs py-1.5 px-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                      onClick={() => createEstimateFromLead(l)}>
                      Create Estimate
                    </button>
                    <button
                      className="w-full text-xs py-1 text-red-500 hover:text-red-700 text-center transition-colors"
                      onClick={() => removeLead(l.id)}>
                      Remove Lead
                    </button>
                  </div>
                </LeadTile>
              ))}
            </div>
          </div>

          {/* Site Visit */}
          <div className="rounded-2xl border-2 border-purple-200 bg-purple-50 p-3">
            <ColHeader label="Site Visit" count={siteLeads.length} dot="bg-purple-400"
              onAdd={() => openAdd('site_visit')} />
            <div className="space-y-2">
              {siteLeads.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No site visits scheduled</p>}
              {siteLeads.map(l => (
                <LeadTile key={l.id} lead={l} today={today}
                  onEdit={() => { setViewLead(l); setEditForm({...l}); }}>
                  <div className="flex flex-col gap-1.5">
                    <button
                      className="w-full text-xs py-1.5 px-2 bg-[#27AE60] text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                      onClick={() => createEstimateFromLead(l)}>
                      Create Estimate
                    </button>
                    <button
                      className="w-full text-xs py-1 text-red-500 hover:text-red-700 text-center transition-colors"
                      onClick={() => removeLead(l.id)}>
                      Remove Lead
                    </button>
                  </div>
                </LeadTile>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Estimates ────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Estimates</h2>
          <div className="flex-1 h-px bg-gray-200" />
          <button className="btn-primary text-xs px-3 py-1.5" onClick={() => navigate('/estimator')}>+ New Estimate</button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Open Estimates */}
          <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-3">
            <ColHeader label="Open Estimate" count={openEstimates.length} dot="bg-orange-400" />
            <div className="space-y-2">
              {openEstimates.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">No open estimates</p>
              )}
              {openEstimates.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                  <div className="cursor-pointer mb-3" onClick={() => setViewEstimate(c)}>
                    <p className="font-mono text-xs text-gray-400">#{c.estimateNumber}</p>
                    <p className="font-semibold text-gray-900 text-sm mt-0.5">{c.clientName}</p>
                    {c.address && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.address}</p>}
                    <p className="text-sm font-bold text-[#27AE60] mt-1">{formatCurrency(c.monthlyRevenue)}/mo</p>
                    <p className="text-xs text-gray-400 mt-0.5">Created {c.createdAt.split('T')[0]}</p>
                  </div>
                  <div className="border-t border-gray-100 pt-2 flex flex-col gap-1.5">
                    <button
                      className="w-full text-xs py-1.5 px-2 bg-[#27AE60] text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                      onClick={() => sendEstimate(c)}>
                      Send Estimate to Client →
                    </button>
                    <button
                      className="w-full text-xs py-1.5 px-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                      onClick={() => navigate('/estimator', { state: { contractId: c.id, clientId: c.clientId || '', clientName: c.clientName, address: c.address, propertyType: c.propertyType } })}>
                      Edit Estimate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Estimate Sent */}
          <div className="rounded-2xl border-2 border-yellow-200 bg-yellow-50 p-3">
            <ColHeader label="Estimate Sent" count={sentEstimates.length} dot="bg-yellow-400" />
            <div className="space-y-2">
              {sentEstimates.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">No estimates sent yet</p>
              )}
              {sentEstimates.map(c => {
                const followUp = addDays(c.sentAt!, 2);
                const followUpOverdue = followUp < today;
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-yellow-200 p-3 shadow-sm">
                    <div className="cursor-pointer mb-3" onClick={() => setViewEstimate(c)}>
                      <p className="font-mono text-xs text-gray-400">#{c.estimateNumber}</p>
                      <p className="font-semibold text-gray-900 text-sm mt-0.5">{c.clientName}</p>
                      {c.address && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.address}</p>}
                      <p className="text-sm font-bold text-[#27AE60] mt-1">{formatCurrency(c.monthlyRevenue)}/mo</p>
                      <div className="mt-2 pt-2 border-t border-yellow-100 space-y-0.5">
                        <p className="text-xs text-gray-500">📤 Sent: {fmtDateTime(c.sentAt!)}</p>
                        <p className={`text-xs font-medium ${followUpOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                          {followUpOverdue ? '⚠ Follow-up overdue:' : '📅 Follow-up:'} {followUp}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-yellow-100 pt-2 flex flex-col gap-1.5">
                      <button
                        className="w-full text-xs py-1.5 px-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                        onClick={() => openActivateFromEstimate(c)}>
                        Won — Create Active Job
                      </button>
                      <button
                        className="w-full text-xs py-1.5 px-2 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
                        onClick={() => lostEstimate(c.id)}>
                        Lost / Rejected
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Won / Lost */}
          <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-3">
            <ColHeader label="Won / Lost" count={wonLeads.length + lostContracts.length} dot="bg-green-500" />
            <div className="space-y-2">
              {wonLeads.length === 0 && lostContracts.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">Outcomes appear here</p>
              )}
              {wonLeads.map(l => (
                <div key={l.id} className="bg-white rounded-xl border border-green-200 p-3 shadow-sm">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-semibold text-gray-900 text-sm">{l.name}</p>
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full ml-2 shrink-0">Won</span>
                  </div>
                  {l.contactName && <p className="text-xs text-gray-500">👤 {l.contactName}</p>}
                  {l.estimatedValue > 0 && (
                    <p className="text-sm font-bold text-[#27AE60] mt-1">{formatCurrency(l.estimatedValue)}/mo</p>
                  )}
                  <button className="mt-2 text-xs text-[#27AE60] hover:underline font-medium"
                    onClick={() => navigate('/projects')}>
                    View in Jobs →
                  </button>
                </div>
              ))}
              {lostContracts.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-red-200 p-3 shadow-sm">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="font-mono text-xs text-gray-400">#{c.estimateNumber}</p>
                      <p className="font-semibold text-gray-900 text-sm">{c.clientName}</p>
                    </div>
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full ml-2 shrink-0">Lost</span>
                  </div>
                  <p className="text-sm text-gray-500">{formatCurrency(c.monthlyRevenue)}/mo</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ADD LEAD MODAL ──────────────────────────────────────────── */}
      {showAddModal && (
        <Modal
          title={`New Lead${addStage !== 'lead' ? ` — ${addStage === 'contacted' ? 'Contacted' : 'Site Visit'}` : ''}`}
          onClose={() => setShowAddModal(false)}
          size="lg"
        >
          {data.clients.length > 0 && (
            <div className="mb-4 pb-4 border-b border-gray-200">
              <label className="label">Import from Existing Client</label>
              <select className="input" defaultValue="" onChange={e => importFromClient(e.target.value)}>
                <option value="">Select a client to pre-fill...</option>
                {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Quickly add an existing client to the pipeline for a new quote.</p>
            </div>
          )}
          <LeadForm form={form} setForm={setForm} />
          <div className="flex gap-3 mt-4">
            <button className="btn-primary flex-1" onClick={addLead}>Add to Pipeline</button>
            <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── EDIT LEAD MODAL ─────────────────────────────────────────── */}
      {viewLead && editForm && (
        <Modal title={viewLead.name} onClose={() => { setViewLead(null); setEditForm(null); }} size="lg">
          <LeadForm form={editForm} setForm={setEditForm as (f: typeof editForm) => void} />

          {/* Linked estimates */}
          {(() => {
            const linked = data.contracts.filter(c =>
              (viewLead.clientId && c.clientId === viewLead.clientId) ||
              c.clientName.toLowerCase() === viewLead.name.toLowerCase()
            );
            if (!linked.length) return null;
            return (
              <div className="bg-gray-50 rounded-xl p-3 mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Linked Estimates</p>
                <div className="space-y-2">
                  {linked.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
                      <div>
                        <span className="font-mono text-xs text-gray-400">#{c.estimateNumber}</span>
                        <span className="ml-2 text-sm font-medium text-gray-900">{c.clientName}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#27AE60]">{formatCurrency(c.monthlyRevenue)}/mo</p>
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full capitalize ${c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'estimate' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>{c.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex gap-3 mt-4 pt-4 border-t flex-wrap">
            <button className="btn-primary flex-1" onClick={saveLead}>Save Changes</button>
            <button className="btn-secondary"
              onClick={() => { createEstimateFromLead(viewLead); setViewLead(null); setEditForm(null); }}>
              + New Estimate
            </button>
            <button className="btn-danger" onClick={() => removeLead(viewLead.id)}>Delete</button>
          </div>
        </Modal>
      )}

      {/* ── ESTIMATE DETAIL MODAL ───────────────────────────────────── */}
      {viewEstimate && (
        <Modal title={`Estimate #${viewEstimate.estimateNumber}`} onClose={() => setViewEstimate(null)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Client</p>
                <p className="font-semibold text-gray-900">{viewEstimate.clientName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Type</p>
                <p className="font-medium capitalize text-gray-700">{viewEstimate.propertyType}</p>
              </div>
              {viewEstimate.address && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Address</p>
                  <p className="text-gray-700">{viewEstimate.address}</p>
                </div>
              )}
              {viewEstimate.sentAt && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Sent</p>
                  <p className="text-gray-700">{fmtDateTime(viewEstimate.sentAt)}</p>
                </div>
              )}
            </div>

            {viewEstimate.lineItems.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Line Items</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Service</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Qty</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Price</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {viewEstimate.lineItems.filter(li => !li.optional).map(li => (
                        <tr key={li.id}>
                          <td className="px-3 py-2 text-gray-800">{li.name}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{li.qty} {li.unit}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(li.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(li.qty * li.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Monthly Revenue</p>
                <p className="text-lg font-bold text-[#27AE60]">{formatCurrency(viewEstimate.monthlyRevenue)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Est. Cost</p>
                <p className="text-lg font-bold text-gray-700">{formatCurrency(viewEstimate.totalCost)}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${viewEstimate.grossMargin >= 30 ? 'bg-green-50' : 'bg-yellow-50'}`}>
                <p className="text-xs text-gray-500 mb-1">Margin</p>
                <p className={`text-lg font-bold ${viewEstimate.grossMargin >= 30 ? 'text-green-700' : 'text-yellow-700'}`}>
                  {viewEstimate.grossMargin.toFixed(1)}%
                </p>
              </div>
            </div>

            {viewEstimate.notes && (
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-gray-700">{viewEstimate.notes}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t flex-wrap">
              <button
                className="btn-primary flex-1"
                style={{ background: '#059669', borderColor: '#059669' }}
                onClick={() => openActivateFromEstimate(viewEstimate)}>
                🚀 Activate as Job
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  navigate('/estimator', { state: { contractId: viewEstimate.id, clientId: viewEstimate.clientId || '', clientName: viewEstimate.clientName, address: viewEstimate.address, propertyType: viewEstimate.propertyType } });
                  setViewEstimate(null);
                }}>
                Edit Estimate
              </button>
              <button className="btn-secondary" onClick={() => setViewEstimate(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── ACTIVATE JOB MODAL ──────────────────────────────────────── */}
      {activateData && (
        <Modal title="Create Active Job" onClose={() => setActivateData(null)} size="md">
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">Activating Estimate</p>
              <p className="font-bold text-gray-900">{activateData.contract.clientName}</p>
              <p className="text-sm text-gray-600">#{activateData.contract.estimateNumber} · {formatCurrency(activateData.contract.monthlyRevenue)}/mo</p>
              {activateData.contract.address && (
                <p className="text-xs text-gray-400 mt-1">{activateData.contract.address}</p>
              )}
            </div>

            <p className="text-sm text-gray-600 font-medium">Set a recurring schedule for this job:</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Day of Week</label>
                <select className="input" value={activateData.schedDay}
                  onChange={e => setActivateData({ ...activateData, schedDay: Number(e.target.value) })}>
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Start Time</label>
                <input className="input" type="time" value={activateData.schedTime}
                  onChange={e => setActivateData({ ...activateData, schedTime: e.target.value })} />
              </div>
              <div>
                <label className="label">Duration (minutes)</label>
                <input className="input" type="number" value={activateData.schedDuration}
                  onChange={e => setActivateData({ ...activateData, schedDuration: Number(e.target.value) })}
                  placeholder="120" />
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t">
              <button
                className="btn-primary flex-1"
                style={{ background: '#059669', borderColor: '#059669' }}
                onClick={doActivateJob}>
                ✓ Activate Job
              </button>
              <button className="btn-secondary" onClick={() => setActivateData(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
