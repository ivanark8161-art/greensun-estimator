import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppData, ServiceRequest, RequestStatus } from '../types';
import { saveData } from '../utils/storage';
import { generateRequestNumber } from '../utils/calculations';

interface Props { data: AppData; setData: (d: AppData) => void }

const STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'New',
  assessment_complete: 'Assessment complete',
  overdue: 'Overdue',
  unscheduled: 'Unscheduled',
  converted: 'Converted',
};

const STATUS_COLOR: Record<RequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  assessment_complete: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  unscheduled: 'bg-yellow-100 text-yellow-700',
  converted: 'bg-purple-100 text-purple-700',
};

const STATUS_DOT: Record<RequestStatus, string> = {
  new: 'bg-blue-500',
  assessment_complete: 'bg-green-500',
  overdue: 'bg-red-500',
  unscheduled: 'bg-yellow-500',
  converted: 'bg-purple-500',
};

function uid() { return `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

export default function Requests({ data, setData }: Props) {
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');

  // ── New request form state ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: '', clientName: '', contactName: '', phone: '', email: '',
    propertyAddress: '', city: '', state: '', zip: '',
    propertyType: 'commercial' as 'commercial' | 'residential',
    source: '', serviceDetails: '', estimatedValue: 0,
  });

  function createRequest() {
    if (!form.clientName.trim()) { alert('Client name is required'); return; }
    const counter = (data.requestCounter ?? 0) + 1;
    const req: ServiceRequest = {
      id: uid(),
      requestNumber: generateRequestNumber(counter),
      title: form.title || form.clientName,
      clientName: form.clientName.trim(),
      contactName: form.contactName,
      phone: form.phone,
      email: form.email,
      propertyAddress: form.propertyAddress,
      city: form.city,
      state: form.state,
      zip: form.zip,
      propertyType: form.propertyType,
      turfSF: 0,
      hardscapeSF: 0,
      serviceDetails: form.serviceDetails,
      assessmentDate: '',
      assessmentNotes: '',
      images: [],
      status: 'new',
      source: form.source,
      estimatedValue: form.estimatedValue,
      convertedQuoteIds: [],
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = { ...data, requestCounter: counter, requests: [...data.requests, req] };
    setData(updated);
    saveData(updated);
    setShowNew(false);
    setForm({ title: '', clientName: '', contactName: '', phone: '', email: '', propertyAddress: '', city: '', state: '', zip: '', propertyType: 'commercial', source: '', serviceDetails: '', estimatedValue: 0 });
    navigate(`/requests/${req.id}`);
  }

  const requests = data.requests ?? [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentRequests = requests.filter(r => new Date(r.createdAt) >= thirtyDaysAgo);
  const converted = requests.filter(r => r.status === 'converted');
  const conversionRate = recentRequests.length > 0
    ? Math.round((converted.filter(r => new Date(r.createdAt) >= thirtyDaysAgo).length / recentRequests.length) * 100)
    : 0;

  const statusCounts: Record<RequestStatus, number> = {
    new: requests.filter(r => r.status === 'new').length,
    assessment_complete: requests.filter(r => r.status === 'assessment_complete').length,
    overdue: requests.filter(r => r.status === 'overdue').length,
    unscheduled: requests.filter(r => r.status === 'unscheduled').length,
    converted: converted.length,
  };

  const filtered = statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Requests</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowNew(true)} className="btn-primary px-5 py-2">New Request</button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Overview */}
        <div className="card">
          <p className="font-semibold text-gray-800 mb-3">Overview</p>
          <div className="space-y-1.5">
            {(Object.entries(STATUS_LABEL) as [RequestStatus, string][]).map(([s, label]) => (
              <div key={s} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                <span className="text-gray-600">{label}</span>
                <span className="ml-auto font-semibold text-gray-800">{statusCounts[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* New requests */}
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <p className="font-semibold text-gray-800">New requests</p>
          </div>
          <p className="text-xs text-gray-400 mb-3">Past 30 days</p>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold text-gray-900">{recentRequests.length}</span>
            <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">0%</span>
          </div>
        </div>

        {/* Conversion rate */}
        <div className="card">
          <p className="font-semibold text-gray-800 mb-1">Conversion rate</p>
          <p className="text-xs text-gray-400 mb-3">Past 30 days</p>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold text-gray-900">{conversionRate}%</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <p className="font-semibold text-gray-800">All requests <span className="text-gray-400 font-normal">({filtered.length} results)</span></p>
          <div className="flex gap-2 ml-4">
            <select
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:border-[#27AE60]"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as RequestStatus | 'all')}
            >
              <option value="all">Status | All</option>
              {(Object.entries(STATUS_LABEL) as [RequestStatus, string][]).map(([s, label]) => (
                <option key={s} value={s}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📥</p>
            <p className="font-medium">No requests yet</p>
            <p className="text-sm mt-1">Click "New Request" to add your first lead</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Property</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Requested</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(req => (
                <tr
                  key={req.id}
                  onClick={() => navigate(`/requests/${req.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-900 text-sm">{req.clientName}</p>
                    {req.contactName && <p className="text-xs text-gray-400">{req.contactName}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{req.title || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {[req.city, req.state, req.zip].filter(Boolean).join(', ') || req.propertyAddress || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {req.phone && <p>{req.phone}</p>}
                    {req.email && <p className="text-[#27AE60]">{req.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[req.status]}`}>
                      {STATUS_LABEL[req.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Request Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">New Request</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Client / Company Name *</label>
                  <input className="input" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="e.g. Hampton Inn Minnetonka" autoFocus />
                </div>
                <div className="col-span-2">
                  <label className="label">Request Title</label>
                  <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Year Round Property Maintenance" />
                </div>
                <div>
                  <label className="label">Contact Name</label>
                  <input className="input" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Property Type</label>
                  <select className="input" value={form.propertyType} onChange={e => setForm(f => ({ ...f, propertyType: e.target.value as 'commercial' | 'residential' }))}>
                    <option value="commercial">Commercial</option>
                    <option value="residential">Residential</option>
                  </select>
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">Property Address</label>
                  <input className="input" value={form.propertyAddress} onChange={e => setForm(f => ({ ...f, propertyAddress: e.target.value }))} placeholder="Street address" />
                </div>
                <div>
                  <label className="label">City</label>
                  <input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">State</label>
                    <input className="input" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2} placeholder="MN" />
                  </div>
                  <div>
                    <label className="label">ZIP</label>
                    <input className="input" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Source</label>
                  <input className="input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Referral, Google, etc." />
                </div>
                <div>
                  <label className="label">Est. Value ($)</label>
                  <input className="input" type="number" min="0" value={form.estimatedValue || ''} onChange={e => setForm(f => ({ ...f, estimatedValue: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div className="col-span-2">
                  <label className="label">Service Details</label>
                  <textarea className="input resize-none" rows={3} value={form.serviceDetails} onChange={e => setForm(f => ({ ...f, serviceDetails: e.target.value }))} placeholder="Describe the services they're requesting..." />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={createRequest} className="btn-primary flex-1">Create Request</button>
              <button onClick={() => setShowNew(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
