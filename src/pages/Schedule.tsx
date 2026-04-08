import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppData, Contract, LandscapingProject } from '../types';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { geocode } from '../utils/geocoding';

interface Props { data: AppData }

const DAY_HEADERS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Calendar helpers ─────────────────────────────────────────────────────────
function getCalendarGrid(year: number, month: number): (Date | null)[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  const firstDow = days[0].getDay();
  const startPad = firstDow === 0 ? 6 : firstDow - 1;
  const grid: (Date | null)[] = [...Array(startPad).fill(null), ...days];
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

function contractsForDay(dow: number, data: AppData): Contract[] {
  return data.contracts
    .filter(c => c.scheduledDay === dow && c.status !== 'closed')
    .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''));
}

function projectsForDay(dateStr: string, data: AppData): LandscapingProject[] {
  return data.projects.filter(p => {
    if (!p.startDate || p.status === 'invoiced') return false;
    return dateStr >= p.startDate && (!p.endDate || dateStr <= p.endDate);
  });
}

function fmtTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2,'0')} ${ampm}`;
}

// ─── Hour-grid block types ────────────────────────────────────────────────────
interface TimeBlock {
  type: 'job' | 'drive';
  label: string;
  sublabel?: string;
  startH: number;  // fractional hours from midnight
  durationH: number;
  contractId?: string;
  projectId?: string;
}

// ─── Hour Grid Modal ──────────────────────────────────────────────────────────
const GRID_START = 7;   // 7 AM
const GRID_END   = 19;  // 7 PM
const GRID_HOURS = GRID_END - GRID_START; // 12

interface HourGridProps {
  date: Date;
  contracts: Contract[];
  projects: LandscapingProject[];
  data: AppData;
  onGoToContract: (c: Contract) => void;
  onGoToProject: (p: LandscapingProject) => void;
  onClose: () => void;
}

function HourGrid({ date, contracts, projects, data, onGoToContract, onGoToProject, onClose }: HourGridProps) {
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const shopAddr   = data.settings.shopAddress;
  const speedMph   = data.settings.averageSpeedMph ?? 30;
  const dateLabel  = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Build job blocks, then insert drive blocks
  useEffect(() => {
    async function build() {
      // Convert contracts to job blocks
      const jobBlocks: TimeBlock[] = [
        ...contracts.map(c => {
          const [h, m] = (c.scheduledTime ?? '08:00').split(':').map(Number);
          const startH = h + m / 60;
          const durH   = (c.scheduledDurationMinutes ?? 120) / 60;
          return {
            type: 'job' as const,
            label: c.clientName,
            sublabel: c.address,
            startH,
            durationH: durH,
            contractId: c.id,
          };
        }),
        ...projects.map(p => ({
          type: 'job' as const,
          label: p.clientName,
          sublabel: p.description || p.address,
          startH: GRID_START,
          durationH: 2,
          projectId: p.id,
        })),
      ].sort((a, b) => a.startH - b.startH);

      // Build ordered list of addresses for drive time
      // Each job needs a "from" address: shop for first, previous job's address for subsequent
      const addresses: string[] = [shopAddr, ...jobBlocks.map(b => {
        if (b.contractId) {
          const c = contracts.find(x => x.id === b.contractId);
          return c?.address ?? '';
        }
        if (b.projectId) {
          const p = projects.find(x => x.id === b.projectId);
          return p?.address ?? '';
        }
        return '';
      })];

      // Geocode all addresses in parallel
      const coords = await Promise.all(addresses.map(a => a ? geocode(a) : Promise.resolve(null)));

      // Build drive blocks inserted before each job
      const result: TimeBlock[] = [];
      for (let i = 0; i < jobBlocks.length; i++) {
        const job    = jobBlocks[i];
        const fromC  = coords[i];   // coords[0]=shop, coords[1]=first job addr, ...
        const toC    = coords[i + 1];
        let driveH   = 0.5; // default 30 min fallback

        if (fromC && toC) {
          const R       = 3958.8;
          const dLat    = ((toC.lat - fromC.lat) * Math.PI) / 180;
          const dLon    = ((toC.lon - fromC.lon) * Math.PI) / 180;
          const sinLat  = Math.sin(dLat / 2);
          const sinLon  = Math.sin(dLon / 2);
          const h       = sinLat * sinLat + Math.cos((fromC.lat * Math.PI) / 180) * Math.cos((toC.lat * Math.PI) / 180) * sinLon * sinLon;
          const miles   = R * 2 * Math.asin(Math.sqrt(h));
          driveH = miles / speedMph;
        }

        const driveStart = job.startH - driveH;
        if (driveH > 0.08 && driveStart >= GRID_START) {
          result.push({
            type: 'drive',
            label: i === 0 ? `Drive from ${data.settings.shopName ?? 'Shop'}` : `Drive from previous job`,
            sublabel: `~${Math.round(driveH * 60)} min`,
            startH: driveStart,
            durationH: driveH,
          });
        }

        result.push(job);
      }

      setBlocks(result);
    }

    build();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, projects, shopAddr, speedMph]);

  // Convert fractional hours to % position on grid
  function toPercent(h: number) {
    return ((Math.max(h, GRID_START) - GRID_START) / GRID_HOURS) * 100;
  }
  function durPercent(h: number) {
    return (Math.min(h, GRID_HOURS) / GRID_HOURS) * 100;
  }

  return (
    <Modal title={dateLabel} onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        {/* Legend */}
        <div className="flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#27AE60] inline-block" /> Job</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-300 inline-block" /> Drive time</span>
        </div>

        {/* Hour grid */}
        <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50" style={{ height: '420px' }}>
          {/* Hour lines + labels */}
          {Array.from({ length: GRID_HOURS + 1 }, (_, i) => {
            const h    = GRID_START + i;
            const pct  = (i / GRID_HOURS) * 100;
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hr   = h % 12 || 12;
            return (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-start"
                style={{ top: `${pct}%` }}
              >
                <span className="text-[10px] text-gray-400 w-10 shrink-0 pl-1 leading-none -mt-px select-none">
                  {hr}{ampm}
                </span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
            );
          })}

          {/* Blocks */}
          <div className="absolute inset-0 ml-10 pr-2">
            {blocks.map((block, i) => {
              const top  = toPercent(block.startH);
              const h    = durPercent(Math.min(block.durationH, GRID_END - block.startH));
              const isJob = block.type === 'job';
              const contract = block.contractId ? contracts.find(c => c.id === block.contractId) : null;
              const project  = block.projectId  ? projects.find(p => p.id  === block.projectId)  : null;
              const isTentative = contract && contract.status === 'estimate';

              return (
                <div
                  key={i}
                  className={`absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden transition-opacity ${
                    isJob
                      ? isTentative
                        ? 'bg-white border-2 border-dashed border-gray-400 text-gray-600 cursor-pointer hover:bg-gray-50'
                        : 'bg-[#27AE60] text-white cursor-pointer hover:bg-[#219a52]'
                      : 'bg-amber-100 border border-amber-300 text-amber-800'
                  }`}
                  style={{ top: `${top}%`, height: `${Math.max(h, 3)}%` }}
                  onClick={() => {
                    if (contract) onGoToContract(contract);
                    else if (project) onGoToProject(project);
                  }}
                >
                  <p className="text-[10px] font-bold leading-tight truncate">{block.label}</p>
                  {block.sublabel && <p className="text-[9px] opacity-75 truncate leading-tight">{block.sublabel}</p>}
                </div>
              );
            })}

            {blocks.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-400">Nothing scheduled on this day.</p>
              </div>
            )}
          </div>
        </div>

        {/* Job list for clicking */}
        {(contracts.length > 0 || projects.length > 0) && (
          <div className="space-y-2">
            {contracts.map(c => (
              <button
                key={c.id}
                onClick={() => onGoToContract(c)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-[#27AE60] hover:bg-green-50 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.status === 'active' ? 'bg-[#27AE60]' : 'border-2 border-dashed border-gray-400'}`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-[#27AE60]">{c.clientName}</p>
                    <p className="text-xs text-gray-500">{c.address}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {c.scheduledTime && <p className="text-sm font-medium text-gray-700">{fmtTime(c.scheduledTime)}</p>}
                  <p className="text-xs text-gray-400">{(c.scheduledDurationMinutes ?? 120) / 60} hr · {c.status}</p>
                  <p className="text-xs text-[#27AE60] font-medium group-hover:underline mt-0.5">Open in Jobs →</p>
                </div>
              </button>
            ))}
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => onGoToProject(p)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">{p.clientName}</p>
                    <p className="text-xs text-gray-500">{p.description || p.address}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-xs text-gray-400">{p.projectNumber} · {p.status}</p>
                  {p.endDate && <p className="text-xs text-gray-400">thru {p.endDate}</p>}
                  <p className="text-xs text-blue-600 font-medium group-hover:underline mt-0.5">Open in Jobs →</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <button className="btn-secondary text-sm w-full" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

// ─── Main Schedule page ───────────────────────────────────────────────────────
export default function Schedule({ data }: Props) {
  const navigate = useNavigate();
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [monthOffset, setMonthOffset]   = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const display    = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year       = display.getFullYear();
  const month      = display.getMonth();
  const grid       = getCalendarGrid(year, month);
  const monthLabel = display.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const activeCount    = data.contracts.filter(c => c.status === 'active'   && c.scheduledDay !== undefined).length;
  const tentativeCount = data.contracts.filter(c => c.status === 'estimate' && c.scheduledDay !== undefined).length;
  const projectCount   = data.projects.filter(p => p.startDate && p.status !== 'invoiced').length;
  const unscheduled    = data.contracts.filter(c => c.scheduledDay === undefined && c.status === 'active').length;

  const selectedDateStr   = selectedDate?.toISOString().slice(0, 10) ?? '';
  const selectedDow       = selectedDate?.getDay() ?? -1;
  const selectedContracts = selectedDate ? contractsForDay(selectedDow, data) : [];
  const selectedProjects  = selectedDate ? projectsForDay(selectedDateStr, data) : [];

  function goToContract(c: Contract) {
    setSelectedDate(null);
    navigate('/projects', { state: { tab: 'maintenance', openContractId: c.id } });
  }

  function goToProject(p: LandscapingProject) {
    setSelectedDate(null);
    navigate('/projects', { state: { tab: 'landscaping', openProjectId: p.id } });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Schedule"
        subtitle="Monthly view of maintenance contracts and landscaping projects"
        action={
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-sm" onClick={() => setMonthOffset(m => m - 1)}>← Prev</button>
            <button className="btn-secondary text-sm" onClick={() => setMonthOffset(0)}>Today</button>
            <button className="btn-secondary text-sm" onClick={() => setMonthOffset(m => m + 1)}>Next →</button>
          </div>
        }
      />

      {/* Month label + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-lg font-bold text-gray-800">{monthLabel}</p>
        <div className="flex gap-5 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#27AE60] inline-block" /> Active ({activeCount})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-dashed border-gray-400 inline-block" /> Tentative ({tentativeCount})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" /> Project ({projectCount})</span>
        </div>
      </div>

      {unscheduled > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
          {unscheduled} active contract{unscheduled > 1 ? 's' : ''} without a schedule — open them in Jobs to assign a day and time.
        </div>
      )}

      {/* Calendar grid */}
      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DAY_HEADERS.map((d, i) => (
            <div key={d} className={`py-2.5 text-center text-xs font-bold uppercase tracking-widest text-gray-400 bg-gray-50 ${i > 0 ? 'border-l border-gray-100' : ''}`}>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((date, i) => {
            if (!date) {
              return (
                <div key={`e${i}`}
                  className={`min-h-[130px] bg-gray-50/40 ${i % 7 !== 0 ? 'border-l border-gray-100' : ''} border-t border-gray-100`}
                />
              );
            }

            const dateStr   = date.toISOString().slice(0, 10);
            const dow       = date.getDay();
            const isToday   = dateStr === todayStr;
            const isPast    = date < today && !isToday;
            const contracts = contractsForDay(dow, data);
            const projects  = projectsForDay(dateStr, data);
            const isNewWeek = i % 7 === 0;
            const hasJobs   = contracts.length + projects.length > 0;

            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDate(date)}
                className={`min-h-[130px] p-2 border-t border-gray-100 ${!isNewWeek ? 'border-l' : ''} cursor-pointer transition-colors ${
                  isToday ? 'bg-green-50 hover:bg-green-100' : isPast ? 'bg-gray-50/30 hover:bg-gray-100/60' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                    isToday ? 'bg-[#27AE60] text-white' : 'text-gray-500'
                  }`}>
                    {date.getDate()}
                  </span>
                  {hasJobs && (
                    <span className="text-[9px] text-gray-400">{contracts.length + projects.length} job{contracts.length + projects.length !== 1 ? 's' : ''}</span>
                  )}
                </div>

                <div className="space-y-0.5">
                  {contracts.map(c => (
                    <div
                      key={c.id}
                      title={`${c.clientName}${c.scheduledTime ? ' — ' + fmtTime(c.scheduledTime) : ''} (${(c.scheduledDurationMinutes ?? 120) / 60} hr)`}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded truncate leading-4 ${
                        c.status === 'active'
                          ? 'bg-[#27AE60] text-white'
                          : 'bg-white border border-dashed border-gray-400 text-gray-500 italic'
                      }`}
                    >
                      {c.scheduledTime && <span className="opacity-70 mr-1 font-normal">{c.scheduledTime.slice(0,5)}</span>}
                      {c.clientName}
                    </div>
                  ))}
                  {projects.map(p => (
                    <div
                      key={p.id}
                      title={`${p.clientName} — ${p.description}`}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded truncate leading-4 bg-blue-50 border border-blue-200 text-blue-700"
                    >
                      {p.clientName}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail — hourly grid */}
      {selectedDate && (
        <HourGrid
          date={selectedDate}
          contracts={selectedContracts}
          projects={selectedProjects}
          data={data}
          onGoToContract={goToContract}
          onGoToProject={goToProject}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
