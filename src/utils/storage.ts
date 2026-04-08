import type { AppData } from '../types';
import { DEFAULT_DATA } from '../data/defaults';
import { getAuthHeaders } from './auth';

const STORAGE_KEY = 'greensun_app_data';
const SERVER_URL  = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';

// ── Migration / hydration logic ───────────────────────────────────────────────
// Shared by both loadData() (sync, from localStorage) and loadFromServer() (async, from file).
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
      snowEvents1_5in:    parsed.settings?.snowEvents1_5in    ?? 10,
      snowEvents4in:      parsed.settings?.snowEvents4in      ?? 5,
      snowEffSFPerHr1_5in: parsed.settings?.snowEffSFPerHr1_5in ?? 44000,
      snowEffSFPerHr4in:   parsed.settings?.snowEffSFPerHr4in   ?? 30000,
      fuelCostPerGallon:   parsed.settings?.fuelCostPerGallon   ?? 3.50,
      vehicleMpg:          parsed.settings?.vehicleMpg          ?? 12,
    },
    equipment,
    serviceCatalog,
    contracts,
    clients: (parsed.clients ?? DEFAULT_DATA.clients).map(c => {
      const hasNew = !!(c.companyName || c.contacts?.length || c.properties?.length);
      if (hasNew) return { ...c, contacts: c.contacts ?? [], properties: c.properties ?? [], leadSource: (c.leadSource ?? '') as import('../types').LeadSource, tags: c.tags ?? [] };
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
    snowTrips:          parsed.snowTrips          ?? [],
    invoices:           parsed.invoices           ?? [],
    timeEntries:        parsed.timeEntries        ?? [],
    expenses:           parsed.expenses           ?? [],
    futureBudget:       parsed.futureBudget       ?? [],
    contractTemplates:  parsed.contractTemplates  ?? DEFAULT_DATA.contractTemplates,
    invoiceCounter:     parsed.invoiceCounter     ?? 1,
    projectCounter:     parsed.projectCounter     ?? 1,
    requestCounter:     parsed.requestCounter     ?? 0,
    requests:           parsed.requests           ?? [],
    salesTaxRates:      parsed.salesTaxRates      ?? [],
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

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  // Fire-and-forget to file — silently ignored if server isn't running
  fetch(`${SERVER_URL}/api/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  }).catch(() => {});
}

// Fetch from file, apply migrations, return hydrated data.
// Returns null if server is unreachable or file is empty.
export async function loadFromServer(): Promise<AppData | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/data`, { headers: { ...getAuthHeaders() } });
    if (!res.ok) return null;
    const raw = await res.json() as AppData;
    if (!raw || Object.keys(raw).length === 0) return null;
    // Store raw data so applyMigrations has access via the shared helper
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
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as AppData;
        saveData(data);
        resolve(data);
      } catch {
        reject(new Error('Invalid backup file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
