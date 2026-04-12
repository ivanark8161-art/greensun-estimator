import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AppData, Client, ClientContact, ClientProperty, LeadSource } from '../types';
import { clientDisplayName, clientPrimaryContact, clientPrimaryProperty, clientDisplayLocation, LEAD_SOURCE_LABELS } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

const LEAD_SOURCES: LeadSource[] = ['referral','google','website','social_media','direct_mail','door_hanger','hms','word_of_mouth','other'];
const TITLES = ['', 'Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];

function blankContact(): Omit<ClientContact,'id'> {
  return { title:'', firstName:'', lastName:'', role:'', phone:'', email:'', isPrimary: false };
}
function blankProperty(): Omit<ClientProperty,'id'> {
  return { name:'', street1:'', street2:'', city:'', state:'MN', zip:'', isBillingAddress: true, contactIds:[], notes:'' };
}
function blankClient(): Omit<Client,'id'|'createdAt'> {
  return { companyName:'', type:'commercial', contacts:[], properties:[], leadSource:'', tags:[], notes:'' };
}

// ─── Client Detail Page ───────────────────────────────────────────────────────
function ClientDetailPage({ data, setData }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'requests'|'quotes'|'jobs'|'invoices'>('quotes');
  const [showEditClient, setShowEditClient] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [editingProperty, setEditingProperty] = useState<ClientProperty | null>(null);
  const [contactForm, setContactForm] = useState(blankContact());
  const [propertyForm, setPropertyForm] = useState(blankProperty());
  const [clientForm, setClientForm] = useState<Omit<Client,'id'|'createdAt'>>(blankClient());
  const [tagInput, setTagInput] = useState('');

  const maybeClient = data.clients.find(c => c.id === id);
  if (!maybeClient) return (
    <div className="p-6 max-w-6xl mx-auto">
      <button onClick={() => navigate('/clients')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Clients</button>
      <p className="text-gray-500">Client not found.</p>
    </div>
  );
  const client: Client = maybeClient;

  const primaryContact = clientPrimaryContact(client);
  const primaryProperty = clientPrimaryProperty(client);

  // Data linked to this client
  const allContracts = data.contracts.filter(c => c.clientId === client.id);
  const quotes       = allContracts.filter(c => ['estimate','draft','awaiting_response','changes_requested','approved'].includes(c.status));
  const jobs         = allContracts.filter(c => c.status === 'active' || c.status === 'closed');
  const requests     = (data.requests ?? []).filter(r => r.clientId === client.id);
  const invoices     = (data.invoices ?? []).filter(i => i.clientId === client.id);
  const totalMonthly = jobs.filter(c => c.status === 'active').reduce((s, c) => s + c.monthlyRevenue, 0);

  function updateClient(updated: Client) {
    const d = { ...data, clients: data.clients.map(c => c.id === client.id ? updated : c) };
    setData(d); saveData(d);
  }

  // ── Edit client ──
  function openEditClient() {
    setClientForm({ companyName: client.companyName, type: client.type, contacts: client.contacts, properties: client.properties, leadSource: client.leadSource, tags: client.tags, notes: client.notes });
    setShowEditClient(true);
  }
  function saveClient() {
    updateClient({ ...client, ...clientForm });
    setShowEditClient(false);
  }

  // ── Contacts ──
  function openAddContact() { setEditingContact(null); setContactForm(blankContact()); setShowAddContact(true); }
  function openEditContact(ct: ClientContact) { setEditingContact(ct); setContactForm({ title:ct.title, firstName:ct.firstName, lastName:ct.lastName, role:ct.role, phone:ct.phone, email:ct.email, isPrimary:ct.isPrimary }); setShowAddContact(true); }
  function saveContact() {
    if (!contactForm.firstName && !contactForm.lastName) { alert('Name required'); return; }
    const newContact: ClientContact = { id: editingContact?.id ?? `ct_${Date.now()}`, ...contactForm };
    const contacts = editingContact
      ? client.contacts.map(c => c.id === editingContact.id ? newContact : c)
      : [...client.contacts, newContact];
    updateClient({ ...client, contacts });
    setShowAddContact(false);
  }
  function deleteContact(ctId: string) {
    if (!confirm('Remove this contact?')) return;
    updateClient({ ...client, contacts: client.contacts.filter(c => c.id !== ctId) });
  }
  function setPrimary(ctId: string) {
    updateClient({ ...client, contacts: client.contacts.map(c => ({ ...c, isPrimary: c.id === ctId })) });
  }

  // ── Properties ──
  function openAddProperty() { setEditingProperty(null); setPropertyForm(blankProperty()); setShowAddProperty(true); }
  function openEditProperty(p: ClientProperty) { setEditingProperty(p); setPropertyForm({ name:p.name??'', street1:p.street1, street2:p.street2, city:p.city, state:p.state, zip:p.zip, taxRateId:p.taxRateId, isBillingAddress:p.isBillingAddress, contactIds:p.contactIds, notes:p.notes }); setShowAddProperty(true); }
  function saveProperty() {
    if (!propertyForm.street1 && !propertyForm.city) { alert('Address required'); return; }
    const newProp: ClientProperty = { id: editingProperty?.id ?? `prop_${Date.now()}`, ...propertyForm };
    const properties = editingProperty
      ? client.properties.map(p => p.id === editingProperty.id ? newProp : p)
      : [...client.properties, newProp];
    updateClient({ ...client, properties });
    setShowAddProperty(false);
  }
  function deleteProperty(propId: string) {
    if (!confirm('Remove this property?')) return;
    updateClient({ ...client, properties: client.properties.filter(p => p.id !== propId) });
  }

  // ── Tags ──
  function addTag() {
    const t = tagInput.trim();
    if (!t || client.tags.includes(t)) { setTagInput(''); return; }
    updateClient({ ...client, tags: [...client.tags, t] });
    setTagInput('');
  }
  function removeTag(t: string) { updateClient({ ...client, tags: client.tags.filter(x => x !== t) }); }

  // ── Notes save ──
  function saveNotes(notes: string) { updateClient({ ...client, notes }); }

  const STATUS_COLOR: Record<string, string> = {
    estimate:'bg-gray-100 text-gray-600', draft:'bg-gray-100 text-gray-600',
    awaiting_response:'bg-yellow-100 text-yellow-700', changes_requested:'bg-orange-100 text-orange-700',
    approved:'bg-green-100 text-green-700', active:'bg-green-100 text-green-700',
    closed:'bg-gray-100 text-gray-500', lost:'bg-red-100 text-red-600',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate('/clients')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Clients</button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{clientDisplayName(client)}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${client.type === 'commercial' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {client.type}
            </span>
          </div>
          {primaryProperty && (
            <p className="text-sm text-gray-500 mt-1">{[primaryProperty.street1, primaryProperty.city, primaryProperty.state].filter(Boolean).join(', ')}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/quotes/new?clientId=${client.id}&clientName=${encodeURIComponent(clientDisplayName(client))}`)} className="btn-primary text-sm py-1.5 px-3">+ Quote</button>
          <button onClick={() => navigate(`/requests/new?clientId=${client.id}&clientName=${encodeURIComponent(clientDisplayName(client))}`)} className="btn-secondary text-sm py-1.5 px-3">+ Request</button>
          <button onClick={openEditClient} className="btn-secondary text-sm py-1.5 px-3">Edit</button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left main content ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Properties */}
          <div className="card p-0">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800">Properties</p>
              <button onClick={openAddProperty} className="text-xs text-[#27AE60] hover:underline font-semibold">+ New Property</button>
            </div>
            {client.properties.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No properties — <button className="text-[#27AE60] hover:underline" onClick={openAddProperty}>add one</button></p>
            ) : (
              <div className="divide-y divide-gray-50">
                {client.properties.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-gray-300 mt-0.5">📍</span>
                      <div>
                        {p.name && <p className="text-sm font-semibold text-gray-900">{p.name}</p>}
                        <p className="text-sm font-medium text-gray-800">{[p.street1, p.street2].filter(Boolean).join(' ') || '(no street)'}</p>
                        <p className="text-xs text-gray-400">{[p.city, p.state, p.zip].filter(Boolean).join(', ')}</p>
                        {p.isBillingAddress && <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Billing Address</span>}
                        {p.taxRateId && <span className="text-[10px] text-gray-400 ml-2">{(data.salesTaxRates ?? []).find(r => r.id === p.taxRateId)?.name ?? ''}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-400">
                      <button onClick={() => openEditProperty(p)} className="hover:text-gray-600">Edit</button>
                      <button onClick={() => deleteProperty(p.id)} className="hover:text-red-500">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contacts */}
          <div className="card p-0">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800">Contacts</p>
              <button onClick={openAddContact} className="text-xs text-[#27AE60] hover:underline font-semibold">+ New Contact</button>
            </div>
            {client.contacts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No contacts — <button className="text-[#27AE60] hover:underline" onClick={openAddContact}>add one</button></p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400">Name</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Role</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Phone</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Email</th>
                    <th className="w-20 px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {client.contacts.map(ct => (
                    <tr key={ct.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{[ct.title, ct.firstName, ct.lastName].filter(Boolean).join(' ')}</span>
                          {ct.isPrimary && <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded">Primary</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{ct.role || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{ct.phone || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{ct.email || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2 text-xs text-gray-400 justify-end">
                          {!ct.isPrimary && <button onClick={() => setPrimary(ct.id)} className="hover:text-[#27AE60]">Set primary</button>}
                          <button onClick={() => openEditContact(ct)} className="hover:text-gray-600">Edit</button>
                          <button onClick={() => deleteContact(ct.id)} className="hover:text-red-500">Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Overview tabs */}
          <div className="card p-0">
            <div className="flex border-b border-gray-100">
              {(['requests','quotes','jobs','invoices'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-3 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-[#27AE60] border-b-2 border-[#27AE60]' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t}
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {t === 'requests' ? requests.length : t === 'quotes' ? quotes.length : t === 'jobs' ? jobs.length : invoices.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Requests tab */}
            {tab === 'requests' && (
              <div>
                {requests.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">No requests yet — <button className="text-[#27AE60] hover:underline" onClick={() => navigate(`/requests/new?clientId=${client.id}&clientName=${encodeURIComponent(clientDisplayName(client))}`)}>create one</button></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-50"><th className="text-left px-5 py-2 text-xs font-semibold text-gray-400">Request</th><th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Date</th><th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Status</th></tr></thead>
                    <tbody>
                      {requests.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                          <td className="px-5 py-2.5 font-medium text-gray-800">#{r.requestNumber} — {(r as { serviceType?: string }).serviceType || 'General'}</td>
                          <td className="px-4 py-2.5 text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                          <td className="px-4 py-2.5"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Quotes tab */}
            {tab === 'quotes' && (
              <div>
                {quotes.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">No quotes yet — <button className="text-[#27AE60] hover:underline" onClick={() => navigate(`/quotes/new?clientId=${client.id}&clientName=${encodeURIComponent(clientDisplayName(client))}`)}>create one</button></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-50"><th className="text-left px-5 py-2 text-xs font-semibold text-gray-400">Quote</th><th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Created</th><th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Status</th><th className="text-right px-4 py-2 text-xs font-semibold text-gray-400">Value</th></tr></thead>
                    <tbody>
                      {quotes.map(q => (
                        <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/quotes/${q.id}`)}>
                          <td className="px-5 py-2.5"><p className="font-medium text-gray-800">#{q.estimateNumber}</p>{q.title && <p className="text-xs text-gray-400">{q.title}</p>}</td>
                          <td className="px-4 py-2.5 text-gray-500">{new Date(q.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                          <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[q.status] ?? 'bg-gray-100 text-gray-500'}`}>{q.status.replace('_',' ')}</span></td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(q.annualRevenue || q.subtotalRevenue || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Jobs tab */}
            {tab === 'jobs' && (
              <div>
                {jobs.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">No active jobs yet</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-50"><th className="text-left px-5 py-2 text-xs font-semibold text-gray-400">Job</th><th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Status</th><th className="text-right px-4 py-2 text-xs font-semibold text-gray-400">Monthly Rev</th><th className="text-right px-4 py-2 text-xs font-semibold text-gray-400">Annual</th></tr></thead>
                    <tbody>
                      {jobs.map(j => (
                        <tr key={j.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/projects/${j.id}`)}>
                          <td className="px-5 py-2.5"><p className="font-medium text-gray-800">{j.title || j.clientName}</p><p className="text-xs text-gray-400">#{j.estimateNumber}</p></td>
                          <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[j.status] ?? 'bg-gray-100 text-gray-500'}`}>{j.status}</span></td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#27AE60]">{formatCurrency(j.monthlyRevenue)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(j.annualRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Invoices tab */}
            {tab === 'invoices' && (
              <div>
                {invoices.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">No invoices yet</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-50"><th className="text-left px-5 py-2 text-xs font-semibold text-gray-400">Invoice</th><th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Date</th><th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Status</th><th className="text-right px-4 py-2 text-xs font-semibold text-gray-400">Amount</th></tr></thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-2.5 font-medium text-gray-800">#{inv.invoiceNumber ?? inv.id}</td>
                          <td className="px-4 py-2.5 text-gray-500">{new Date((inv as { date?: string }).date ?? inv.createdAt ?? '').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                          <td className="px-4 py-2.5"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{inv.status}</span></td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(inv.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="w-72 shrink-0 space-y-4">
          {/* Contact info */}
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Contact info</p>
            <div className="space-y-2 text-sm">
              {primaryContact ? (
                <>
                  <div><p className="text-xs text-gray-400">Primary contact</p><p className="font-medium text-gray-800">{[primaryContact.title, primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' ')}</p></div>
                  {primaryContact.phone && <div><p className="text-xs text-gray-400">Phone</p><p className="text-gray-700">{primaryContact.phone}</p></div>}
                  {primaryContact.email && <div><p className="text-xs text-gray-400">Email</p><p className="text-[#27AE60] break-all">{primaryContact.email}</p></div>}
                </>
              ) : <p className="text-gray-400 text-xs">No contacts added</p>}
              {client.leadSource && (
                <div><p className="text-xs text-gray-400">Lead source</p><p className="text-gray-700">{LEAD_SOURCE_LABELS[client.leadSource]}</p></div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Tags</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {client.tags.length === 0 && <p className="text-xs text-gray-400">No tags</p>}
              {client.tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {t}
                  <button onClick={() => removeTag(t)} className="text-gray-400 hover:text-red-500 leading-none">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input className="input text-xs py-1 flex-1" placeholder="Add tag..." value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} />
              <button onClick={addTag} className="text-xs text-[#27AE60] font-semibold px-2 hover:underline">Add</button>
            </div>
          </div>

          {/* Billing history */}
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Billing history</p>
            {totalMonthly > 0 && (
              <div className="mb-3 p-2.5 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-500">Active monthly revenue</p>
                <p className="text-lg font-bold text-[#27AE60]">{formatCurrency(totalMonthly)}/mo</p>
              </div>
            )}
            {invoices.length === 0 ? (
              <p className="text-xs text-gray-400">No billing history yet</p>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 5).map(inv => (
                  <div key={inv.id} className="flex justify-between text-xs">
                    <span className="text-gray-500">{new Date((inv as { date?: string }).date ?? inv.createdAt ?? '').toLocaleDateString('en-US',{month:'short',year:'numeric'})}</span>
                    <span className={`font-semibold ${inv.status === 'paid' ? 'text-green-600' : inv.status === 'overdue' ? 'text-red-500' : 'text-gray-700'}`}>{formatCurrency(inv.total)}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-gray-100 flex justify-between text-xs font-semibold">
                  <span className="text-gray-500">Total billed</span>
                  <span className="text-gray-900">{formatCurrency(invoices.reduce((s, i) => s + i.total, 0))}</span>
                </div>
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400">Current balance</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s,i) => s + i.total, 0))}</p>
            </div>
          </div>

          {/* Internal notes */}
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Internal notes</p>
            <textarea
              className="input resize-none text-sm w-full"
              rows={4}
              defaultValue={client.notes}
              placeholder="Internal notes (only visible to your team)"
              onBlur={e => saveNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Edit Client Modal */}
      {showEditClient && (
        <Modal title="Edit Client" onClose={() => setShowEditClient(false)}>
          <div className="space-y-3">
            <div>
              <label className="label">Company / Client Name *</label>
              <input className="input" value={clientForm.companyName} onChange={e => setClientForm(f => ({...f, companyName: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type</label>
                <select className="input" value={clientForm.type} onChange={e => setClientForm(f => ({...f, type: e.target.value as Client['type']}))}>
                  <option value="commercial">Commercial</option>
                  <option value="residential">Residential</option>
                </select>
              </div>
              <div>
                <label className="label">Lead Source</label>
                <select className="input" value={clientForm.leadSource} onChange={e => setClientForm(f => ({...f, leadSource: e.target.value as LeadSource}))}>
                  <option value="">Select...</option>
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={saveClient}>Save</button>
              <button className="btn-secondary" onClick={() => setShowEditClient(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit Contact Modal */}
      {showAddContact && (
        <Modal title={editingContact ? 'Edit Contact' : 'New Contact'} onClose={() => setShowAddContact(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Title</label>
                <select className="input" value={contactForm.title} onChange={e => setContactForm(f => ({...f, title: e.target.value}))}>
                  {TITLES.map(t => <option key={t} value={t}>{t || 'No title'}</option>)}
                </select>
              </div>
              <div>
                <label className="label">First name *</label>
                <input className="input" value={contactForm.firstName} onChange={e => setContactForm(f => ({...f, firstName: e.target.value}))} />
              </div>
              <div>
                <label className="label">Last name</label>
                <input className="input" value={contactForm.lastName} onChange={e => setContactForm(f => ({...f, lastName: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Role</label>
                <input className="input" placeholder="Property Manager, Owner..." value={contactForm.role} onChange={e => setContactForm(f => ({...f, role: e.target.value}))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" type="tel" value={contactForm.phone} onChange={e => setContactForm(f => ({...f, phone: e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({...f, email: e.target.value}))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPrimary" checked={contactForm.isPrimary} onChange={e => setContactForm(f => ({...f, isPrimary: e.target.checked}))} className="accent-[#27AE60]" />
              <label htmlFor="isPrimary" className="text-sm text-gray-700">Primary contact</label>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={saveContact}>Save Contact</button>
              <button className="btn-secondary" onClick={() => setShowAddContact(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit Property Modal */}
      {showAddProperty && (
        <Modal title={editingProperty ? 'Edit Property' : 'New Property'} onClose={() => setShowAddProperty(false)}>
          <div className="space-y-3">
            <div>
              <label className="label">Property name</label>
              <input className="input" placeholder="Main Office, Parking Lot, North Entrance…" value={propertyForm.name} onChange={e => setPropertyForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div>
              <label className="label">Street address *</label>
              <input className="input" placeholder="123 Main St" value={propertyForm.street1} onChange={e => setPropertyForm(f => ({...f, street1: e.target.value}))} />
            </div>
            <div>
              <label className="label">Street 2</label>
              <input className="input" placeholder="Suite, Unit, etc." value={propertyForm.street2} onChange={e => setPropertyForm(f => ({...f, street2: e.target.value}))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="label">City</label>
                <input className="input" value={propertyForm.city} onChange={e => setPropertyForm(f => ({...f, city: e.target.value}))} />
              </div>
              <div>
                <label className="label">State</label>
                <input className="input" value={propertyForm.state} onChange={e => setPropertyForm(f => ({...f, state: e.target.value}))} />
              </div>
              <div>
                <label className="label">ZIP</label>
                <input className="input" value={propertyForm.zip} onChange={e => setPropertyForm(f => ({...f, zip: e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="label">Tax rate</label>
              <select className="input" value={propertyForm.taxRateId ?? ''} onChange={e => setPropertyForm(f => ({...f, taxRateId: e.target.value || undefined}))}>
                <option value="">No tax rate</option>
                {(data.salesTaxRates ?? []).map(r => <option key={r.id} value={r.id}>{r.name} ({r.rate}%)</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isBillingAddr" checked={propertyForm.isBillingAddress} onChange={e => setPropertyForm(f => ({...f, isBillingAddress: e.target.checked}))} className="accent-[#27AE60]" />
              <label htmlFor="isBillingAddr" className="text-sm text-gray-700">Use as billing address</label>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} value={propertyForm.notes} onChange={e => setPropertyForm(f => ({...f, notes: e.target.value}))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={saveProperty}>Save Property</button>
              <button className="btn-secondary" onClick={() => setShowAddProperty(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Create Client Form (full page, Jobber-style) ─────────────────────────────
function CreateClientPage({ data, setData }: Props) {
  const navigate = useNavigate();
  const [primaryContact, setPrimaryContact] = useState<Omit<ClientContact,'id'>>({ title:'', firstName:'', lastName:'', role:'', phone:'', email:'', isPrimary:true });
  const [property, setProperty] = useState<Omit<ClientProperty,'id'>>({ name:'', street1:'', street2:'', city:'', state:'MN', zip:'', isBillingAddress:true, contactIds:[], notes:'' });
  const [companyName, setCompanyName] = useState('');
  const [clientType, setClientType] = useState<Client['type']>('commercial');
  const [leadSource, setLeadSource] = useState<LeadSource>('');

  function save() {
    if (!companyName.trim() && !primaryContact.firstName.trim()) { alert('Company name or contact name required'); return; }
    const contactId = `ct_${Date.now()}`;
    const propId    = `prop_${Date.now()}`;
    const newClient: Client = {
      id: `cl_${Date.now()}`,
      companyName: companyName.trim() || `${primaryContact.firstName} ${primaryContact.lastName}`.trim(),
      type: clientType,
      contacts: primaryContact.firstName || primaryContact.lastName
        ? [{ id: contactId, ...primaryContact, isPrimary: true }]
        : [],
      properties: property.street1 || property.city
        ? [{ id: propId, ...property, contactIds: primaryContact.firstName ? [contactId] : [] }]
        : [],
      leadSource,
      tags: [],
      notes: '',
      createdAt: new Date().toISOString(),
    };
    const updated = { ...data, clients: [...data.clients, newClient] };
    setData(updated); saveData(updated);
    navigate(`/clients/${newClient.id}`);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate('/clients')} className="text-sm text-gray-400 hover:text-gray-600 mb-6">← Clients</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Client</h1>

      <div className="space-y-6">
        {/* Primary contact */}
        <div className="card">
          <p className="font-semibold text-gray-800 mb-1">Primary contact details</p>
          <p className="text-xs text-gray-400 mb-4">Main point of contact for communication and billing</p>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Title</label>
                <select className="input" value={primaryContact.title} onChange={e => setPrimaryContact(f => ({...f, title: e.target.value}))}>
                  {TITLES.map(t => <option key={t} value={t}>{t || 'No title'}</option>)}
                </select>
              </div>
              <div>
                <label className="label">First name</label>
                <input className="input" value={primaryContact.firstName} onChange={e => setPrimaryContact(f => ({...f, firstName: e.target.value}))} placeholder="First name" />
              </div>
              <div>
                <label className="label">Last name</label>
                <input className="input" value={primaryContact.lastName} onChange={e => setPrimaryContact(f => ({...f, lastName: e.target.value}))} placeholder="Last name" />
              </div>
            </div>
            <div>
              <label className="label">Company name</label>
              <input className="input" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. LaQuinta Hotel, Mills Church" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Phone</label>
                <input className="input" type="tel" value={primaryContact.phone} onChange={e => setPrimaryContact(f => ({...f, phone: e.target.value}))} placeholder="(612) 555-0100" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={primaryContact.email} onChange={e => setPrimaryContact(f => ({...f, email: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Client type</label>
                <select className="input" value={clientType} onChange={e => setClientType(e.target.value as Client['type'])}>
                  <option value="commercial">Commercial</option>
                  <option value="residential">Residential</option>
                </select>
              </div>
              <div>
                <label className="label">Lead source</label>
                <select className="input" value={leadSource} onChange={e => setLeadSource(e.target.value as LeadSource)}>
                  <option value="">Select source...</option>
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Property address */}
        <div className="card">
          <p className="font-semibold text-gray-800 mb-1">Property address</p>
          <p className="text-xs text-gray-400 mb-4">Primary service location</p>
          <div className="space-y-3">
            <div>
              <label className="label">Property name</label>
              <input className="input" value={property.name} onChange={e => setProperty(f => ({...f, name: e.target.value}))} placeholder="Main Office, Parking Lot, North Entrance…" />
            </div>
            <div>
              <label className="label">Street 1</label>
              <input className="input" value={property.street1} onChange={e => setProperty(f => ({...f, street1: e.target.value}))} placeholder="10600 Wayzata Boulevard" />
            </div>
            <div>
              <label className="label">Street 2</label>
              <input className="input" value={property.street2} onChange={e => setProperty(f => ({...f, street2: e.target.value}))} placeholder="Suite, Unit, Building..." />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">City</label>
                <input className="input" value={property.city} onChange={e => setProperty(f => ({...f, city: e.target.value}))} />
              </div>
              <div>
                <label className="label">State</label>
                <input className="input" value={property.state} onChange={e => setProperty(f => ({...f, state: e.target.value}))} />
              </div>
              <div>
                <label className="label">ZIP</label>
                <input className="input" value={property.zip} onChange={e => setProperty(f => ({...f, zip: e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="label">Tax rate</label>
              <select className="input" value={property.taxRateId ?? ''} onChange={e => setProperty(f => ({...f, taxRateId: e.target.value || undefined}))}>
                <option value="">No tax rate created</option>
                {(data.salesTaxRates ?? []).map(r => <option key={r.id} value={r.id}>{r.name} ({r.rate}%)</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="billingAddr" checked={property.isBillingAddress} onChange={e => setProperty(f => ({...f, isBillingAddress: e.target.checked}))} className="accent-[#27AE60]" />
              <label htmlFor="billingAddr" className="text-sm text-gray-700">Billing address is the same as property address</label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={() => navigate('/clients')}>Cancel</button>
          <button className="btn-primary flex-1" onClick={save}>Save client</button>
        </div>
      </div>
    </div>
  );
}

// ─── Client List Page ─────────────────────────────────────────────────────────
function ClientListPage({ data, setData: _setData }: Props) {
  const navigate = useNavigate();

  function clientRevenue(clientId: string) {
    return data.contracts.filter(c => c.clientId === clientId && c.status === 'active').reduce((s, c) => s + c.monthlyRevenue, 0);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-400 mt-0.5">{data.clients.length} client{data.clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/clients/new')}>+ New Client</button>
      </div>

      {data.clients.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No clients yet</p>
          <button className="btn-primary" onClick={() => navigate('/clients/new')}>Add your first client</button>
        </div>
      ) : (
        <div className="card p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Primary Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Lead Source</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Monthly Rev</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500" />
              </tr>
            </thead>
            <tbody>
              {data.clients.map(c => {
                const rev      = clientRevenue(c.id);
                const primary  = clientPrimaryContact(c);
                const location = clientDisplayLocation(c);
                const activeJobs = data.contracts.filter(x => x.clientId === c.id && x.status === 'active').length;
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/clients/${c.id}`)}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900 text-sm">{clientDisplayName(c)}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.type === 'commercial' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{c.type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {primary ? (
                        <>
                          <p>{[primary.title, primary.firstName, primary.lastName].filter(Boolean).join(' ')}</p>
                          {primary.phone && <p className="text-xs text-gray-400">{primary.phone}</p>}
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{location || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.leadSource ? LEAD_SOURCE_LABELS[c.leadSource] : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      {rev > 0 ? <span className="font-semibold text-[#27AE60] text-sm">{formatCurrency(rev)}/mo</span> : <span className="text-gray-300 text-sm">—</span>}
                      {activeJobs > 0 && <p className="text-xs text-gray-400">{activeJobs} active job{activeJobs !== 1 ? 's' : ''}</p>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => navigate(`/requests/new?clientId=${c.id}&clientName=${encodeURIComponent(clientDisplayName(c))}`)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 text-gray-600 hover:bg-gray-50 whitespace-nowrap">+ Request</button>
                        <button onClick={() => navigate(`/quotes/new?clientId=${c.id}&clientName=${encodeURIComponent(clientDisplayName(c))}`)} className="text-xs border border-[#27AE60] rounded-lg px-2.5 py-1 text-[#27AE60] hover:bg-green-50 whitespace-nowrap">+ Quote</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function Clients({ data, setData }: Props) {
  const { id } = useParams<{ id?: string }>();
  if (id === 'new') return <CreateClientPage data={data} setData={setData} />;
  if (id)          return <ClientDetailPage  data={data} setData={setData} />;
  return                  <ClientListPage    data={data} setData={setData} />;
}
