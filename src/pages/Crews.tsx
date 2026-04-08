import { useState } from 'react';
import type { AppData, Crew } from '../types';
import { saveData } from '../utils/storage';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

interface Props { data: AppData; setData: (d: AppData) => void }

const emptyCrewForm = (): Omit<Crew, 'id'> => ({
  name: '', memberIds: [], equipmentIds: [], contractIds: [], notes: '',
});

export default function Crews({ data, setData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [form, setForm] = useState(emptyCrewForm());

  function openAdd() {
    setEditing(null);
    setForm(emptyCrewForm());
    setShowModal(true);
  }

  function openEdit(crew: Crew) {
    setEditing(crew);
    setForm({ name: crew.name, memberIds: crew.memberIds, equipmentIds: crew.equipmentIds, contractIds: crew.contractIds, notes: crew.notes });
    setShowModal(true);
  }

  function save() {
    if (!form.name.trim()) { alert('Crew name required'); return; }
    let updated: AppData;
    if (editing) {
      updated = { ...data, crews: data.crews.map(c => c.id === editing.id ? { ...editing, ...form } : c) };
    } else {
      updated = { ...data, crews: [...data.crews, { id: `crew_${Date.now()}`, ...form }] };
    }
    setData(updated); saveData(updated); setShowModal(false);
  }

  function deleteCrew(id: string) {
    if (!confirm('Delete this crew?')) return;
    const updated = { ...data, crews: data.crews.filter(c => c.id !== id) };
    setData(updated); saveData(updated);
  }

  function toggleId(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Crew Management"
        subtitle="Assign team members and equipment to service crews"
        action={<button className="btn-primary" onClick={openAdd}>+ Add Crew</button>}
      />

      {data.crews.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No crews yet</p>
          <button className="btn-primary" onClick={openAdd}>Create your first crew</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {data.crews.map(crew => {
            const members  = data.employees.filter(e => crew.memberIds.includes(e.id));
            const equip    = data.equipment.filter(e => crew.equipmentIds.includes(e.id));
            const contracts = data.contracts.filter(c => crew.contractIds.includes(c.id));
            const laborCost = members.reduce((s, e) => s + e.hourlyRate, 0);

            return (
              <div key={crew.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{crew.name}</h2>
                    <p className="text-sm text-gray-500">{members.length} members · {equip.length} equipment items</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary text-xs px-3 py-1" onClick={() => openEdit(crew)}>Edit</button>
                    <button className="btn-danger text-xs px-3 py-1" onClick={() => deleteCrew(crew.id)}>Delete</button>
                  </div>
                </div>

                {/* Members */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Team Members</p>
                  {members.length === 0 ? (
                    <p className="text-xs text-gray-400">None assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {members.map(m => (
                        <span key={m.id} className="badge-green">{m.name} — ${m.hourlyRate}/hr</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Equipment */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Equipment</p>
                  {equip.length === 0 ? (
                    <p className="text-xs text-gray-400">None assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {equip.map(e => (
                        <span key={e.id} className="badge-gray">{e.name}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contracts */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Assigned Contracts</p>
                  {contracts.length === 0 ? (
                    <p className="text-xs text-gray-400">None assigned</p>
                  ) : (
                    <div className="space-y-1">
                      {contracts.map(c => (
                        <div key={c.id} className="flex justify-between text-xs bg-gray-50 rounded px-2 py-1">
                          <span className="text-gray-700 font-medium">{c.clientName}</span>
                          <span className="text-[#27AE60] font-semibold">${c.monthlyRevenue}/mo</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Blended rate */}
                {members.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                    <span>Blended labor rate</span>
                    <span className="font-semibold">${(laborCost / members.length).toFixed(2)}/hr avg</span>
                  </div>
                )}

                {crew.notes && <p className="mt-2 text-xs text-gray-400 italic">{crew.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editing ? `Edit ${editing.name}` : 'New Crew'} onClose={() => setShowModal(false)} size="lg">
          <div className="space-y-5">
            <div>
              <label className="label">Crew Name</label>
              <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Crew Alpha" />
            </div>

            <div>
              <label className="label">Team Members</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {data.employees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.memberIds.includes(emp.id)}
                      onChange={() => setForm({...form, memberIds: toggleId(form.memberIds, emp.id)})}
                      className="accent-[#27AE60]"
                    />
                    <span className="text-sm">{emp.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{emp.role} · ${emp.hourlyRate}/hr</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Equipment</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {data.equipment.map(eq => (
                  <label key={eq.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.equipmentIds.includes(eq.id)}
                      onChange={() => setForm({...form, equipmentIds: toggleId(form.equipmentIds, eq.id)})}
                      className="accent-[#27AE60]"
                    />
                    <span className="text-sm">{eq.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">${eq.monthlyDepreciation}/mo</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Assigned Contracts</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {data.contracts.filter(c => c.status === 'active' || c.status === 'estimate').map(c => (
                  <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.contractIds.includes(c.id)}
                      onChange={() => setForm({...form, contractIds: toggleId(form.contractIds, c.id)})}
                      className="accent-[#27AE60]"
                    />
                    <span className="text-sm">{c.clientName}</span>
                    <span className="text-xs text-gray-400 ml-auto">${c.monthlyRevenue}/mo</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>

            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={save}>Save Crew</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
