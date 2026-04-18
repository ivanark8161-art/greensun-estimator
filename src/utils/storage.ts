import type { AppData } from '../types';
import { DEFAULT_DATA } from '../data/defaults';
import { getAuthHeaders } from './auth';

const STORAGE_KEY = 'greensun_app_data';
// Electron connects to the local server; web uses relative URLs (same origin).
const _isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
const SERVER_URL  = import.meta.env.VITE_API_URL ?? (_isElectron ? 'http://127.0.0.1:3001' : '');

// ── Collections stored as per-document in MongoDB ─────────────────────────────
const ARRAY_COLLECTIONS = [
  'clients','contracts','jobs','invoices','snowTrips','timeEntries','expenses',
  'employees','equipment','overhead','fieldSupplies','subcontractors','crews',
  'projects','requests','leads','futureBudget','contractTemplates',
  'salesTaxRates','serviceCatalog','accountingCodes','timeSheets',
] as const;

const COUNTER_KEYS = [
  'estimateCounter','invoiceCounter','projectCounter',
  'requestCounter','jobCounter','snowTripCounter',
] as const;


// ── Migration / hydration logic ───────────────────────────────────────────────
function applyMigrations(parsed: AppData): AppData {
  const equipment = (parsed.equipment ?? DEFAULT_DATA.equipment).map(e => ({
    monthlyMaintenancePct: 5,
    paymentType: 'paid_in_full' as const,
    monthlyPaymentAmount: 0,
    ...(e as object),
  })) as AppData['equipment'];

  const contracts = (parsed.contracts ?? DEFAULT_DATA.contracts).map(c => {
    const defaultContract = DEFAULT_DATA.contracts.find(d => d.id === c.id);
    return {
      title: '',
      requestId: '',
      estimatedHoursPerVisit: 2,
      scheduledDay: undefined as number | undefined,
      scheduledTime: undefined as string | undefined,
      scheduledDurationMinutes: undefined as number | undefined,
      taxRate: DEFAULT_DATA.settings.defaultTaxRate,
      discountAmount: 0,
      additionalOverheadPct: 0,
      consumablesPct: 0,
      downPaymentRequired: 0,
      city: '',
      state: '',
      zip: '',
      clientEmail: '',
      milesFromShop: 0,
      ...(c as object),
      ...(c.annualRevenue
        ? { monthlyRevenue: parseFloat((c.annualRevenue / 12).toFixed(2)) }
        : {}),
      ...(defaultContract && Math.abs((c.annualRevenue ?? 0) - defaultContract.annualRevenue) > 1
        ? { monthlyRevenue: defaultContract.monthlyRevenue, annualRevenue: defaultContract.annualRevenue }
        : {}),
    };
  }) as AppData['contracts'];

  const rawCatalog = parsed.serviceCatalog?.length ? parsed.serviceCatalog : DEFAULT_DATA.serviceCatalog;
  const serviceCatalog = rawCatalog
    .filter(s => s.id !== 'svc2' && s.id !== 'svc3')
    .map(s => {
      const base = { estimatedHours: 0, equipmentIds: [] as string[], ...(s as object) };
      if ((base as unknown as { unit?: string }).unit === '1,000 sq ft') {
        (base as unknown as { unit: string }).unit = 'visit';
      }
      if (s.id === 'svc1') {
        return {
          ...base,
          name: 'Lawn Mowing',
          description: 'Mow all turf · perimeter weed whipping · hard surface blowing',
          estimatedHours: 0.0371,
          unit: 'visit',
        };
      }
      return base;
    }) as AppData['serviceCatalog'];

  return {
    ...DEFAULT_DATA,
    ...parsed,
    settings: {
      ...DEFAULT_DATA.settings,
      ...parsed.settings,
      snowPlowHrsPerKSFPerInch:     0.01515,
      snowSidewalkHrsPerKSFPerInch: 0.1111,
      snowEvents1_5in:     parsed.settings?.snowEvents1_5in    ?? 10,
      snowEvents4in:       parsed.settings?.snowEvents4in      ?? 5,
      snowEventsDusting:   parsed.settings?.snowEventsDusting  ?? 8,
      snowEffSFPerHr1_5in: parsed.settings?.snowEffSFPerHr1_5in ?? 44000,
      snowEffSFPerHr4in:   parsed.settings?.snowEffSFPerHr4in   ?? 30000,
      snowPlow4inHrs:        parsed.settings?.snowPlow4inHrs        ?? 4,
      snowPlow4inSF:         parsed.settings?.snowPlow4inSF         ?? 66000,
      snowShovel4inHrs:      parsed.settings?.snowShovel4inHrs      ?? 4.5,
      snowShovel4inSF:       parsed.settings?.snowShovel4inSF       ?? 7000,
      snowPlow1_5inHrs:      parsed.settings?.snowPlow1_5inHrs      ?? 2,
      snowPlow1_5inSF:       parsed.settings?.snowPlow1_5inSF       ?? 66000,
      snowShovel1_5inHrs:    parsed.settings?.snowShovel1_5inHrs    ?? 1.5,
      snowShovel1_5inSF:     parsed.settings?.snowShovel1_5inSF     ?? 7000,
      snowPlowDustingHrs:    parsed.settings?.snowPlowDustingHrs    ?? 1,
      snowPlowDustingSF:     parsed.settings?.snowPlowDustingSF     ?? 66000,
      snowShovelDustingHrs:  parsed.settings?.snowShovelDustingHrs  ?? 1,
      snowShovelDustingSF:   parsed.settings?.snowShovelDustingSF   ?? 7000,
      fuelCostPerGallon:   parsed.settings?.fuelCostPerGallon   ?? 3.50,
      vehicleMpg:          parsed.settings?.vehicleMpg          ?? 12,
    },
    equipment,
    serviceCatalog,
    contracts,
    clients: (parsed.clients ?? DEFAULT_DATA.clients).map(c => {
      const hasNew = !!(c.companyName || c.contacts?.length || c.properties?.length);
      if (hasNew) return { ...c, contacts: c.contacts ?? [], properties: (c.properties ?? []).map((p: any) => ({ name: '', ...p })), leadSource: (c.leadSource ?? '') as import('../types').LeadSource, tags: c.tags ?? [] };
      const contactId = `${c.id}_c1`;
      const propId = `${c.id}_p1`;
      const nameParts = (c.contactName || '').trim().split(' ');
      return {
        id: c.id,
        companyName: (c.name || c.companyName || '').trim(),
        type: c.type ?? 'commercial',
        contacts: c.contactName ? [{
          id: contactId,
          title: '',
          firstName: nameParts[0] ?? '',
          lastName: nameParts.slice(1).join(' ') ?? '',
          role: '',
          phone: c.phone || '',
          email: c.email || '',
          isPrimary: true,
        }] : [],
        properties: [{
          id: propId,
          name: '',
          street1: c.billingAddress || '',
          street2: '',
          city: c.city || '',
          state: c.state || 'MN',
          zip: c.zip || '',
          isBillingAddress: true,
          contactIds: c.contactName ? [contactId] : [],
          notes: '',
        }],
        leadSource: (c.leadSource || '') as import('../types').LeadSource,
        tags: c.tags ?? [],
        notes: c.notes || '',
        createdAt: c.createdAt,
      } satisfies import('../types').Client;
    }),
    leads:              parsed.leads              ?? [],
    projects:           parsed.projects           ?? [],
    snowTrips:          (parsed.snowTrips ?? []).filter(t => !!(t as { jobId?: string }).jobId),
    invoices:           parsed.invoices           ?? [],
    timeEntries:        parsed.timeEntries        ?? [],
    futureBudget:       parsed.futureBudget       ?? [],
    contractTemplates:  parsed.contractTemplates  ?? DEFAULT_DATA.contractTemplates,
    accountingCodes:    parsed.accountingCodes    ?? [],
    invoiceCounter:     parsed.invoiceCounter     ?? 1,
    projectCounter:     parsed.projectCounter     ?? 1,
    requestCounter:     parsed.requestCounter     ?? 0,
    jobCounter:         parsed.jobCounter         ?? 1,
    snowTripCounter:    parsed.snowTripCounter    ?? 1,
    jobs:               (parsed.jobs ?? []).map(j => ({ ...j, visitLogs: j.visitLogs ?? [] })),
    expenses:           (parsed.expenses ?? []).map(e => ({ ...e, status: e.status ?? 'approved' })) as AppData['expenses'],
    requests:           parsed.requests           ?? [],
    timeSheets:         parsed.timeSheets         ?? [],
    salesTaxRates:      parsed.salesTaxRates      ?? [],
    subcontractors:     parsed.subcontractors     ?? [],
    savedAt:            parsed.savedAt            ?? undefined,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    return applyMigrations(JSON.parse(raw) as AppData);
  } catch {
    return DEFAULT_DATA;
  }
}

// Synchronous local-only save — keeps localStorage in sync immediately.
export function saveData(data: AppData): void {
  const stamped = { ...data, savedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
}

// ── Diff-based save: send only what changed to the server ─────────────────────
export async function saveChangesAsync(prev: AppData, next: AppData): Promise<boolean> {
  // Always update localStorage immediately (offline safety)
  saveData(next);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(getAuthHeaders() as Record<string, string>),
    };
    const reqs: Promise<Response>[] = [];

    // Array collections — upsert changed items, delete removed items
    for (const col of ARRAY_COLLECTIONS) {
      const prevArr = ((prev[col as keyof AppData] ?? []) as { id: string }[]);
      const nextArr = ((next[col as keyof AppData] ?? []) as { id: string }[]);

      const prevById = new Map(prevArr.map(i => [i.id, i]));
      const nextById = new Map(nextArr.map(i => [i.id, i]));

      for (const [id, item] of nextById) {
        const p = prevById.get(id);
        if (!p || JSON.stringify(p) !== JSON.stringify(item)) {
          reqs.push(fetch(`${SERVER_URL}/api/${col}/${encodeURIComponent(id)}`, {
            method: 'PUT', headers, body: JSON.stringify(item),
          }));
        }
      }
      for (const [id] of prevById) {
        if (!nextById.has(id)) {
          reqs.push(fetch(`${SERVER_URL}/api/${col}/${encodeURIComponent(id)}`, {
            method: 'DELETE', headers,
          }));
        }
      }
    }

    // Settings
    if (JSON.stringify(prev.settings) !== JSON.stringify(next.settings)) {
      reqs.push(fetch(`${SERVER_URL}/api/settings`, {
        method: 'PATCH', headers, body: JSON.stringify(next.settings),
      }));
    }

    // Counters
    const counterChanged = COUNTER_KEYS.some(k => prev[k as keyof AppData] !== next[k as keyof AppData]);
    if (counterChanged) {
      const counters = Object.fromEntries(COUNTER_KEYS.map(k => [k, next[k as keyof AppData]]));
      reqs.push(fetch(`${SERVER_URL}/api/counters`, {
        method: 'PATCH', headers, body: JSON.stringify(counters),
      }));
    }

    if (reqs.length === 0) return true;
    const results = await Promise.all(reqs);
    return results.every(r => r.ok);
  } catch {
    return false;
  }
}

// ── SSE real-time subscription ────────────────────────────────────────────────
export interface SSEEvent {
  type?: string;
  collection?: string;
  operation?: string;
  doc?: Record<string, unknown>;
  docId?: string;
}

export function subscribeToStream(onEvent: (e: SSEEvent) => void): () => void {
  let es: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  async function connect() {
    if (closed) return;
    try {
      // Get a short-lived stream token from the server (required in production)
      const tokenRes = await fetch(`${SERVER_URL}/api/stream-token`, {
        method: 'POST',
        headers: { ...(getAuthHeaders() as Record<string, string>) },
      });
      if (!tokenRes.ok) {
        if (!closed) retryTimer = setTimeout(connect, 10000);
        return;
      }
      const { token } = await tokenRes.json() as { token: string };
      if (closed) return;

      const url = `${SERVER_URL}/api/stream?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      es.onmessage = ev => {
        try { onEvent(JSON.parse(ev.data) as SSEEvent); } catch { /* ignore */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) retryTimer = setTimeout(connect, 5000);
      };
    } catch {
      if (!closed) retryTimer = setTimeout(connect, 10000);
    }
  }

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
}

// Fetch from server, apply migrations, return hydrated data.
export async function loadFromServer(): Promise<AppData | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/data`, { headers: { ...(getAuthHeaders() as Record<string, string>) } });
    if (!res.ok) return null;
    const raw = await res.json() as AppData;
    if (!raw || Object.keys(raw).length === 0) return null;
    // Any non-empty response from the server is authoritative
    const hasContent = Object.values(raw).some(v => Array.isArray(v) && (v as unknown[]).length > 0)
      || (raw.settings && Object.keys(raw.settings).length > 0);
    if (!hasContent) return null;
    return applyMigrations(raw);
  } catch {
    return null;
  }
}

export function resetData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportData(): void {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `greensun-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as AppData;
        saveData(data);
        // Push the full import to the server via writeAppData (POST /api/data)
        await fetch(`${SERVER_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(getAuthHeaders() as Record<string, string>) },
          body: JSON.stringify(data),
        });
        resolve(data);
      } catch {
        reject(new Error('Invalid backup file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Legacy export — kept so any remaining callers don't break at compile time.
// New code should use saveChangesAsync(prev, next) instead.
export async function saveDataAsync(data: AppData): Promise<boolean> {
  saveData(data);
  try {
    const res = await fetch(`${SERVER_URL}/api/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(getAuthHeaders() as Record<string, string>) },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}
