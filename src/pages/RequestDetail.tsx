import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AppData, RequestStatus, RequestImage } from '../types';
import { saveData } from '../utils/storage';
import { generateEstimateNumber } from '../utils/calculations';

interface Props { data: AppData; setData: (d: AppData) => void }

const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: 'new',                label: 'New' },
  { value: 'unscheduled',        label: 'Unscheduled' },
  { value: 'assessment_complete',label: 'Assessment complete' },
  { value: 'overdue',            label: 'Overdue' },
  { value: 'converted',          label: 'Converted' },
];

const STATUS_COLOR: Record<RequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  assessment_complete: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  unscheduled: 'bg-yellow-100 text-yellow-700',
  converted: 'bg-purple-100 text-purple-700',
};

function imgUid() { return `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

export default function RequestDetail({ data, setData }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const req = data.requests?.find(r => r.id === id);
  if (!req) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p className="text-2xl mb-2">Request not found</p>
        <button onClick={() => navigate('/requests')} className="btn-secondary mt-4">← Back to Requests</button>
      </div>
    );
  }

  // Local editable state — mirrors the request record
  const [draft, setDraft] = useState({ ...req });
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  function patch(updates: Partial<typeof draft>) {
    setDraft(d => ({ ...d, ...updates, updatedAt: new Date().toISOString() }));
  }

  function save(updates?: Partial<typeof draft>) {
    const final = updates ? { ...draft, ...updates, updatedAt: new Date().toISOString() } : { ...draft, updatedAt: new Date().toISOString() };
    setDraft(final);
    const updated = { ...data, requests: data.requests.map(r => r.id === id ? final : r) };
    setData(updated);
    saveData(updated);
    setSaving(true);
    setTimeout(() => setSaving(false), 1200);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    let remaining = files.length;
    const newImages: RequestImage[] = [];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        newImages.push({
          id: imgUid(),
          name: file.name,
          dataUrl: ev.target?.result as string,
          caption: '',
          uploadedAt: new Date().toISOString(),
        });
        remaining--;
        if (remaining === 0) {
          const imgs = [...draft.images, ...newImages];
          save({ images: imgs });
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function removeImage(imgId: string) {
    save({ images: draft.images.filter(i => i.id !== imgId) });
  }

  function updateImageCaption(imgId: string, caption: string) {
    patch({ images: draft.images.map(i => i.id === imgId ? { ...i, caption } : i) });
  }

  function addNote() {
    if (!newNote.trim()) return;
    const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    save({ notes: draft.notes ? `${draft.notes}\n\n[${ts}] ${newNote.trim()}` : `[${ts}] ${newNote.trim()}` });
    setNewNote('');
  }

  function convertToQuote() {
    if (!confirm('Convert this request to a new quote?')) return;
    const counter = (data.estimateCounter || 7) + 1;
    const quoteId = `c_${Date.now()}`;
    const quoteNumber = generateEstimateNumber(counter);

    // We store minimal quote data — QuoteDetail will handle the full form
    const newContract = {
      id: quoteId,
      estimateNumber: quoteNumber,
      title: draft.title,
      requestId: draft.id,
      clientId: draft.clientId,
      clientName: draft.clientName,
      propertyType: draft.propertyType,
      address: draft.propertyAddress || '',
      city: draft.city,
      state: draft.state,
      zip: draft.zip,
      clientEmail: draft.email,
      milesFromShop: 0,
      turfSF: draft.turfSF,
      hardscapeSF: draft.hardscapeSF,
      perimeterFt: 0,
      lineItems: [],
      visitsPerMonth: 4,
      activeMonths: ['apr','may','jun','jul','aug','sep','oct'] as import('../types').Month[],
      subtotalRevenue: 0,
      totalCost: 0,
      grossMargin: 0,
      monthlyRevenue: 0,
      annualRevenue: 0,
      estimatedHoursPerVisit: 2,
      taxRate: data.settings.defaultTaxRate,
      discountAmount: 0,
      additionalOverheadPct: 0,
      consumablesPct: 0,
      downPaymentRequired: 0,
      startDate: '',
      endDate: '',
      status: 'draft' as import('../types').ContractStatus,
      notes: `Converted from Request #${draft.requestNumber}. ${draft.serviceDetails}`.trim(),
      terms: 'Net 30. Late payment: 1.5%/month (18% annual).',
      createdAt: new Date().toISOString(),
    };

    const updatedReq = { ...draft, status: 'converted' as RequestStatus, convertedQuoteIds: [...draft.convertedQuoteIds, quoteId], updatedAt: new Date().toISOString() };
    const updated = {
      ...data,
      estimateCounter: counter,
      contracts: [...data.contracts, newContract],
      requests: data.requests.map(r => r.id === id ? updatedReq : r),
    };
    setDraft(updatedReq);
    setData(updated);
    saveData(updated);
    navigate(`/quotes/${quoteId}`);
  }

  const linkedQuotes = data.contracts.filter(c => draft.convertedQuoteIds.includes(c.id));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => navigate('/requests')} className="text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
          ← Requests
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-xs font-mono text-gray-500">#{draft.requestNumber}</span>
        <select
          value={draft.status}
          onChange={e => save({ status: e.target.value as RequestStatus })}
          className={`text-xs font-semibold px-3 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLOR[draft.status]}`}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {saving && <span className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">Saved ✓</span>}
          {draft.status !== 'converted' && (
            <button onClick={convertToQuote} className="btn-primary text-sm px-4 py-1.5">Convert to Quote →</button>
          )}
          <button onClick={() => save()} className="btn-secondary text-sm px-4 py-1.5">Save</button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-3 gap-6">
        {/* ── Left: main content ────────────────────────────────────── */}
        <div className="col-span-2 space-y-5">

          {/* Title */}
          <input
            className="w-full text-3xl font-bold text-gray-900 bg-transparent border-0 border-b-2 border-transparent focus:border-[#27AE60] focus:outline-none pb-1"
            value={draft.title}
            onChange={e => patch({ title: e.target.value })}
            onBlur={() => save()}
            placeholder="Request title..."
          />

          {/* Client info card */}
          <div className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <h3 className="font-semibold text-gray-900">{draft.clientName || 'Client'}</h3>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5 text-right">
                <p>Requested {new Date(draft.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                {linkedQuotes.length > 0 && (
                  <p>Used for: {linkedQuotes.map(q => (
                    <button key={q.id} onClick={() => navigate(`/quotes/${q.id}`)} className="text-[#27AE60] hover:underline mx-0.5">
                      Quote #{q.estimateNumber}
                    </button>
                  ))}</p>
                )}
                {draft.assessmentDate && <p>Assessment: {draft.assessmentDate}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Client / Company</label>
                <input className="input" value={draft.clientName} onChange={e => patch({ clientName: e.target.value })} onBlur={() => save()} />
              </div>
              <div>
                <label className="label">Contact Name</label>
                <input className="input" value={draft.contactName} onChange={e => patch({ contactName: e.target.value })} onBlur={() => save()} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={draft.phone} onChange={e => patch({ phone: e.target.value })} onBlur={() => save()} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={draft.email} onChange={e => patch({ email: e.target.value })} onBlur={() => save()} />
              </div>
              <div className="col-span-2">
                <label className="label">Street Address</label>
                <input className="input" value={draft.propertyAddress} onChange={e => patch({ propertyAddress: e.target.value })} onBlur={() => save()} placeholder="Street address" />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" value={draft.city} onChange={e => patch({ city: e.target.value })} onBlur={() => save()} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">State</label>
                  <input className="input" value={draft.state} onChange={e => patch({ state: e.target.value })} onBlur={() => save()} maxLength={2} placeholder="MN" />
                </div>
                <div>
                  <label className="label">ZIP</label>
                  <input className="input" value={draft.zip} onChange={e => patch({ zip: e.target.value })} onBlur={() => save()} />
                </div>
              </div>
              <div>
                <label className="label">Property Type</label>
                <select className="input" value={draft.propertyType} onChange={e => { patch({ propertyType: e.target.value as 'commercial' | 'residential' }); save({ propertyType: e.target.value as 'commercial' | 'residential' }); }}>
                  <option value="commercial">Commercial</option>
                  <option value="residential">Residential</option>
                </select>
              </div>
              <div>
                <label className="label">Source</label>
                <input className="input" value={draft.source} onChange={e => patch({ source: e.target.value })} onBlur={() => save()} placeholder="Referral, Google..." />
              </div>
              <div>
                <label className="label">Turf Area (sq ft)</label>
                <input className="input" type="number" min="0" value={draft.turfSF || ''} onChange={e => patch({ turfSF: Number(e.target.value) })} onBlur={() => save()} />
              </div>
              <div>
                <label className="label">Hard Surfaces (sq ft)</label>
                <input className="input" type="number" min="0" value={draft.hardscapeSF || ''} onChange={e => patch({ hardscapeSF: Number(e.target.value) })} onBlur={() => save()} />
              </div>
              <div>
                <label className="label">Est. Value ($)</label>
                <input className="input" type="number" min="0" value={draft.estimatedValue || ''} onChange={e => patch({ estimatedValue: Number(e.target.value) })} onBlur={() => save()} />
              </div>
              <div>
                <label className="label">Assessment Date</label>
                <input className="input" type="date" value={draft.assessmentDate} onChange={e => { patch({ assessmentDate: e.target.value }); save({ assessmentDate: e.target.value }); }} />
              </div>
            </div>
          </div>

          {/* Overview / Service Details */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Overview</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Service details</label>
                <p className="text-xs text-gray-400 mb-1">Please provide as much information as you can</p>
                <textarea
                  className="input resize-none"
                  rows={4}
                  value={draft.serviceDetails}
                  onChange={e => patch({ serviceDetails: e.target.value })}
                  onBlur={() => save()}
                  placeholder="Describe the services requested, property conditions, special requirements..."
                />
              </div>
            </div>
          </div>

          {/* On-site Assessment */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">On-site assessment</h3>
            <div>
              <label className="label">Assessment notes</label>
              <textarea
                className="input resize-none"
                rows={5}
                value={draft.assessmentNotes}
                onChange={e => patch({ assessmentNotes: e.target.value })}
                onBlur={() => save()}
                placeholder="Notes from the on-site visit — conditions observed, measurements, scope clarifications..."
              />
            </div>
          </div>

          {/* Photos */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Photos</h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                + Upload Photos
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>

            {draft.images.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#27AE60] hover:bg-green-50/30 transition-colors"
              >
                <p className="text-gray-400 text-2xl mb-2">📷</p>
                <p className="text-sm text-gray-500">Click to upload site photos</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, HEIC supported</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {draft.images.map(img => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="w-full h-36 object-cover rounded-xl border border-gray-200"
                    />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-2 right-2 bg-black/60 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                    <input
                      className="mt-1 w-full text-xs text-gray-500 bg-transparent border-0 border-b border-transparent focus:border-gray-300 focus:outline-none px-0"
                      value={img.caption}
                      onChange={e => updateImageCaption(img.id, e.target.value)}
                      onBlur={() => save()}
                      placeholder="Add caption..."
                    />
                  </div>
                ))}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="h-36 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center cursor-pointer hover:border-[#27AE60] hover:bg-green-50/30 transition-colors"
                >
                  <span className="text-gray-400 text-2xl">+</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: notes panel ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Notes</h3>
            <div className="space-y-3">
              <textarea
                className="input resize-none text-sm"
                rows={3}
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Leave an internal note..."
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addNote(); }}
              />
              <button onClick={addNote} className="btn-primary text-xs w-full py-1.5">Add Note</button>
            </div>

            {draft.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                {draft.notes.split('\n\n').filter(Boolean).map((note, i) => (
                  <div key={i} className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    {note.startsWith('[') ? (
                      <>
                        <p className="text-[10px] text-gray-400 mb-1">{note.match(/\[([^\]]+)\]/)?.[1]}</p>
                        <p>{note.replace(/^\[[^\]]+\]\s*/, '')}</p>
                      </>
                    ) : <p>{note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick info */}
          <div className="card text-sm space-y-2">
            <p className="font-semibold text-gray-700 mb-2">Request Info</p>
            <div className="flex justify-between text-gray-500">
              <span>Number</span><span className="font-mono">#{draft.requestNumber}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Created</span>
              <span>{new Date(draft.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Updated</span>
              <span>{new Date(draft.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            {draft.source && (
              <div className="flex justify-between text-gray-500">
                <span>Source</span><span>{draft.source}</span>
              </div>
            )}
            {draft.estimatedValue > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Est. Value</span>
                <span className="text-green-600 font-semibold">${draft.estimatedValue.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Linked quotes */}
          {linkedQuotes.length > 0 && (
            <div className="card">
              <p className="font-semibold text-gray-700 mb-2 text-sm">Linked Quotes</p>
              {linkedQuotes.map(q => (
                <button
                  key={q.id}
                  onClick={() => navigate(`/quotes/${q.id}`)}
                  className="w-full text-left text-sm p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <p className="font-medium text-[#27AE60]">Quote #{q.estimateNumber}</p>
                  <p className="text-xs text-gray-400">{q.clientName} · {q.status}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
