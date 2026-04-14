export type SeasonType = 'spring' | 'summer' | 'fall' | 'winter';

// ─── Accounting Codes ─────────────────────────────────────────────────────────
// Labor codes (01-xxx) are stored here as freeform entries.
// Codes for resources 2-5 are stored directly on each resource item (costCode field).
export interface AccountingCode {
  id: string;
  code: string;   // e.g. "01-001"
  name: string;   // e.g. "Lawn Maintenance Labor"
  notes: string;
}

// ─── Service Catalog ──────────────────────────────────────────────────────────
export type ServiceCategory = 'maintenance' | 'snow' | 'landscaping' | 'other';

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  unit: string;
  defaultUnitCost: number;
  defaultUnitPrice: number;
  estimatedHours: number;      // labor hours per unit
  equipmentIds: string[];      // equipment used (reference only)
  futureEquipmentIds?: string[]; // planned equipment from Growth Planner
  targetMargin?: number;       // per-service target margin % (overrides global if set)
  laborCodeId?: string;        // AccountingCode.id — which 01-xxx code this service maps to
  taxable: boolean;
  notes: string;
}

// ─── Estimate Line Items ──────────────────────────────────────────────────────
export interface EstimateLineItem {
  id: string;
  catalogItemId?: string;
  name: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  estimatedHours?: number;   // labor hours per occurrence (per visit for maintenance)
  isOneTime?: boolean;       // true = billed once, not recurring monthly
  optional: boolean;
  taxable: boolean;
  isSnowPerTrip?: boolean;  // true = per-trip pricing, excluded from annual/monthly totals
  notes: string;
}

// ─── Clients ──────────────────────────────────────────────────────────────────
export type LeadSource = '' | 'referral' | 'google' | 'website' | 'social_media' | 'direct_mail' | 'door_hanger' | 'hms' | 'word_of_mouth' | 'other';

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  '': 'Unknown',
  referral: 'Referral',
  google: 'Google',
  website: 'Website',
  social_media: 'Social Media',
  direct_mail: 'Direct Mail',
  door_hanger: 'Door Hanger',
  hms: 'HMS',
  word_of_mouth: 'Word of Mouth',
  other: 'Other',
};

export interface ClientContact {
  id: string;
  title: string;        // 'Mr.' | 'Ms.' | 'Mrs.' | 'Dr.' | ''
  firstName: string;
  lastName: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface ClientProperty {
  id: string;
  name: string;           // e.g. "Main Office", "Parking Lot", "Back Entrance"
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  taxRateId?: string;
  isBillingAddress: boolean;
  contactIds: string[];   // which contacts are associated with this property
  notes: string;
}

export interface Client {
  id: string;
  companyName: string;
  type: 'commercial' | 'residential';
  contacts: ClientContact[];
  properties: ClientProperty[];
  leadSource: LeadSource;
  tags: string[];
  notes: string;
  createdAt: string;
  // Legacy fields kept for storage migration compat — do not use in new code
  name?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function clientDisplayName(c: Client): string {
  return c.companyName || c.name || 'Unnamed Client';
}

export function clientPrimaryContact(c: Client): ClientContact | null {
  return c.contacts?.find(ct => ct.isPrimary) ?? c.contacts?.[0] ?? null;
}

export function clientPrimaryProperty(c: Client): ClientProperty | null {
  return c.properties?.find(p => p.isBillingAddress) ?? c.properties?.[0] ?? null;
}

export function clientDisplayLocation(c: Client): string {
  const prop = clientPrimaryProperty(c);
  if (prop) return [prop.city, prop.state].filter(Boolean).join(', ');
  return [c.city, c.state].filter(Boolean).join(', ');
}

// ─── Equipment ───────────────────────────────────────────────────────────────
export interface Equipment {
  id: string;
  name: string;
  purchaseDate: string;
  purchaseCost: number;
  usefulLifeYears: number;
  monthlyDepreciation: number;   // calculated: depreciation + maintenance reserve
  monthlyMaintenancePct: number; // % of purchase cost per year reserved for maintenance (default 5)
  paymentType: 'paid_in_full' | 'monthly_payment';
  monthlyPaymentAmount: number;  // actual loan/lease payment (used for totals when paymentType = monthly_payment)
  seasons: SeasonType[];
  costCode?: string;             // e.g. "04-001" — assigned in Accounting Codes tab
  notes: string;
}

// ─── Employees ───────────────────────────────────────────────────────────────
export interface Employee {
  id: string;
  name: string;
  role: string;
  hourlyRate: number;
  hoursPerWeek: number;
  isOwner: boolean;
  startDate: string;
  notes: string;
}

// ─── Overhead ────────────────────────────────────────────────────────────────
export type OverheadCategory = 'software' | 'insurance' | 'license' | 'office' | 'other';

export interface OverheadItem {
  id: string;
  category: OverheadCategory;
  name: string;
  monthlyCost: number;
  costCode?: string;   // e.g. "05-001"
  notes: string;
}

// ─── Field Supplies ──────────────────────────────────────────────────────────
export interface FieldSupply {
  id: string;
  category: 'fuel' | 'material' | 'equipment' | 'gear';
  name: string;
  unit: string;
  unitCost: number;
  monthlyUsage: number;
  costCode?: string;   // e.g. "02-001"
}

// ─── Contracts ───────────────────────────────────────────────────────────────
export type PropertyType = 'commercial' | 'residential';
export type ContractStatus = 'estimate' | 'draft' | 'awaiting_response' | 'changes_requested' | 'approved' | 'active' | 'closed' | 'lost' | 'converted' | 'rejected';

export const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;
export type Month = typeof MONTHS[number];

export const MONTH_LABELS: Record<Month, string> = {
  jan:'Jan', feb:'Feb', mar:'Mar', apr:'Apr', may:'May', jun:'Jun',
  jul:'Jul', aug:'Aug', sep:'Sep', oct:'Oct', nov:'Nov', dec:'Dec',
};

export interface Contract {
  id: string;
  estimateNumber: string;
  title?: string;
  requestId?: string;
  clientId?: string;
  clientName: string;
  propertyType: PropertyType;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  clientEmail?: string;
  milesFromShop?: number;
  turfSF: number;
  hardscapeSF: number;
  perimeterFt: number;
  lineItems: EstimateLineItem[];
  visitsPerMonth: number;
  activeMonths: Month[];
  subtotalRevenue: number;
  totalCost: number;
  grossMargin: number;
  monthlyRevenue: number;
  annualRevenue: number;
  estimatedHoursPerVisit: number;   // editable — drives projected cost
  crewId?: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  scheduledDay?: number;             // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  scheduledTime?: string;            // "HH:MM" 24-hr format
  scheduledDurationMinutes?: number; // defaults to 120 at render time
  sentAt?: string;                   // ISO timestamp when estimate was sent to client
  taxRate: number;                   // sales tax % applied to taxable items
  discountAmount: number;            // flat dollar discount off subtotal
  additionalOverheadPct: number;     // fixed overhead % applied to annual value
  consumablesPct: number;            // consumables % applied to annual value
  costingCodes?: JobCostingCodes;        // populated when job is activated
  taxRateId?: string;                // references SalesTaxRate.id
  downPaymentRequired: number;       // deposit required upfront
  contractLength?: '1_year' | '2_year' | '3_year' | 'custom'; // auto-sets endDate for maintenance
  notes: string;
  terms: string;
  createdAt: string;
  // Revision chain
  revisionOf?: string;       // id of the parent quote this was revised from
  revisionNumber?: number;   // 1 = first revision, 2 = second, etc.
}

// ─── Snow Removal ─────────────────────────────────────────────────────────────
export interface SnowTrip {
  id: string;
  jobId: string;           // links to Job (jobType === 'snow')
  clientId?: string;
  clientName: string;
  propertyAddress: string;
  serviceDate: string;     // YYYY-MM-DD
  snowfallInches: number;
  onSiteHours: number;     // total time on property
  plowingHours: number;
  shovelingHours: number;
  deicingBags: number;     // qty; cost rate pulled from settings
  equipmentIds: string[];  // from Equipment resources
  employeeIds: string[];   // from Employee resources
  notes: string;
  status: 'logged' | 'invoiced' | 'paid';
  invoiceId?: string;
  createdAt: string;
}

// ─── Invoices ────────────────────────────────────────────────────────────────
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId?: string;
  clientName: string;
  contractId?: string;
  snowTripIds: string[];
  lineItems: EstimateLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  status: InvoiceStatus;
  issuedDate: string;
  dueDate: string;
  paidDate: string;
  paidAmount: number;
  notes: string;
  createdAt: string;
  qboInvoiceId?: string;
  qboCustomerId?: string;
  qboDocNumber?: string;
  qboStatus?: string;
  qboSyncedAt?: string;
}

// ─── Pipeline / CRM ──────────────────────────────────────────────────────────
export type PipelineStage = 'lead' | 'contacted' | 'site_visit' | 'estimate_created' | 'estimate_sent' | 'won' | 'lost';

export interface PipelineLead {
  id: string;
  name: string;
  type: 'commercial' | 'residential';
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  estimatedValue: number;
  stage: PipelineStage;
  source: string;
  notes: string;
  followUpDate: string;
  clientId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Landscaping Projects ────────────────────────────────────────────────────
export type ProjectStatus = 'estimate' | 'approved' | 'in_progress' | 'completed' | 'invoiced' | 'lost';

export interface LandscapingProject {
  id: string;
  projectNumber: string;
  clientId?: string;
  clientName: string;
  address: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  estimatedHours: number;
  estimatedMaterialCost: number;
  lineItems: EstimateLineItem[];
  subtotalRevenue: number;
  totalCost: number;
  grossMargin: number;
  crewId?: string;
  notes: string;
  createdAt: string;
}

// ─── Time Tracking ────────────────────────────────────────────────────────────
export interface TimeEntry {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  jobType: 'contract' | 'project' | 'general';
  jobId?: string;
  jobName: string;
  hours: number;
  notes: string;
  createdAt: string;
}

// ─── Subcontractors ───────────────────────────────────────────────────────────
export interface Subcontractor {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  specialty: string;
  rateType: 'hourly' | 'daily' | 'project';
  rate: number;
  costCode?: string;   // e.g. "03-001"
  notes: string;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export type ExpenseCategory = 'fuel' | 'material' | 'equipment' | 'subcontractor' | 'other';

export interface ExpenseEntry {
  id: string;
  date: string;
  jobType: 'contract' | 'project' | 'overhead';
  jobId?: string;
  jobName: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  notes: string;
  createdAt: string;
}

// ─── Crews ───────────────────────────────────────────────────────────────────
export interface Crew {
  id: string;
  name: string;
  memberIds: string[];
  equipmentIds: string[];
  contractIds: string[];
  notes: string;
}

// ─── Future Budget ────────────────────────────────────────────────────────────
export type BudgetPriority = 'low' | 'medium' | 'high';
export type BudgetStatus   = 'planning' | 'approved' | 'purchased';
export type BudgetCategory = 'equipment' | 'vehicle' | 'technology' | 'facility' | 'labor' | 'marketing' | 'other';

export interface FutureBudgetItem {
  id: string;
  name: string;
  category: BudgetCategory;
  estimatedCost: number;       // effective monthly cost (depreciation or payment)
  priority: BudgetPriority;
  targetDate: string;          // YYYY-MM
  status: BudgetStatus;
  notes: string;
  link?: string;               // URL to price source or listing
  createdAt: string;
  // Equipment/vehicle-specific fields
  purchaseCost?: number;
  usefulLifeMonths?: number;
  maintenancePct?: number;
  paymentType?: 'paid_in_full' | 'monthly_payment';
  monthlyPaymentAmount?: number;
}

// ─── Contract Templates ───────────────────────────────────────────────────────
export type ContractTemplateType = 'maintenance' | 'landscaping' | 'snow';

export interface ContractTemplate {
  id: string;
  name: string;
  type: ContractTemplateType;
  content: string;
  updatedAt: string;
}

// ─── Requests ─────────────────────────────────────────────────────────────────
export type RequestStatus = 'new' | 'assessment_complete' | 'overdue' | 'unscheduled' | 'converted';

export interface RequestImage {
  id: string;
  name: string;
  dataUrl: string;   // base64 stored in localStorage
  caption: string;
  uploadedAt: string;
}

export interface ServiceRequest {
  id: string;
  requestNumber: string;  // e.g. "26-001"
  title: string;
  clientId?: string;
  clientName: string;
  contactName: string;
  phone: string;
  email: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  propertyType: PropertyType;
  turfSF: number;
  hardscapeSF: number;
  serviceDetails: string;
  assessmentDate: string;
  assessmentNotes: string;
  images: RequestImage[];
  status: RequestStatus;
  source: string;
  estimatedValue: number;
  convertedQuoteIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Sales Tax Rates ──────────────────────────────────────────────────────────
export interface SalesTaxRate {
  id: string;
  name: string;      // e.g. "Hennepin County - Landscaping"
  state: string;     // e.g. "MN"
  county: string;    // e.g. "Hennepin"
  activity: string;  // e.g. "Landscaping Services"
  rate: number;      // percentage, e.g. 7.525
}

// ─── Job Costing ──────────────────────────────────────────────────────────────
export type CostCodeCategory = 'labor' | 'materials' | 'subcontractor' | 'equipment' | 'other';

export const COST_CODE_LABELS: Record<CostCodeCategory, string> = {
  labor:         '1 - Labor',
  materials:     '2 - Materials',
  subcontractor: '3 - Subcontractor',
  equipment:     '4 - Equipment',
  other:         '5 - Other (Drive Time / Overhead)',
};

export interface JobCostCode {
  category:  CostCodeCategory;
  budgeted:  number;   // original estimate value
  actual:    number;   // sum of time entries + expenses posted to this code
  notes:     string;
}

export interface JobProjectionSnapshot {
  id:            string;
  postedAt:      string;   // ISO date
  periodLabel:   string;   // e.g. "April 2026"
  costCodes: {
    category:        CostCodeCategory;
    originalEstimate: number;
    actualCost:       number;
    remainingCost:    number;
    projectedCost:    number;  // prorated by % of job timeline elapsed
    marginPct:        number;
  }[];
  totalOriginal:   number;
  totalActual:     number;
  totalRemaining:  number;
  totalProjected:  number;
  projectedMargin: number;
  invoicedToDate:  number;
  notes:           string;
}

export type JobStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface Job {
  id:              string;
  jobNumber:       string;   // e.g. "J-001"
  contractId:      string;   // source quote
  clientId?:       string;
  clientName:      string;
  title:           string;
  jobType:         'maintenance' | 'landscaping' | 'snow';
  status:          JobStatus;
  startDate:       string;   // YYYY-MM-DD
  endDate:         string;   // YYYY-MM-DD
  crewId?:         string;
  costCodes:       JobCostCode[];
  driveTimeMinutes: number;  // editable, defaults from quote miles
  hoursPerVisit:   number;
  visitsPerMonth:  number;
  projections:     JobProjectionSnapshot[];
  lastProjectionPrompt?: string;  // ISO date of last "post projection" prompt
  notes:           string;
  createdAt:       string;
}

// Legacy type kept for compat
export type AccountingCodeCategory = CostCodeCategory;
export const ACCOUNTING_CODE_LABELS = COST_CODE_LABELS;
export interface AccountingCodeBucket { category: AccountingCodeCategory; budgeted: number; actual: number; notes: string; }
export interface JobCostingCodes { maintenance: AccountingCodeBucket[]; snow: AccountingCodeBucket[]; }

// ─── App Settings ─────────────────────────────────────────────────────────────
export interface AppSettings {
  targetMargin: number;
  defaultWorkingDaysPerMonth: number;
  laborRatePerHour: number;
  mowingRateSFPerHour: number;
  weedWhippingFtPerHour: number;
  blowingRateSFPerHour: number;
  travelTimeMinutes: number;
  setupCleanupMinutes: number;
  defaultTaxRate: number;
  defaultPaymentTermsDays: number;
  plowingRatePerHour: number;
  shovelingRatePerHour: number;
  deicingRatePerBag: number;
  plowingCostPerHour: number;
  shovelingCostPerHour: number;
  deicingCostPerBag: number;
  shopName: string;
  shopAddress: string;
  averageSpeedMph: number;
  payrollBurdenPercent: number;  // employer taxes + workers comp (% of wage, e.g. 13)
  consumablesPercent: number;    // % markup added to cost for consumables (default 3)
  overheadMarkupPercent: number; // % markup added to cost for overhead (default 3)
  snowSidewalkHrsPerKSFPerInch: number; // shoveling efficiency (hrs per 1,000 SF per inch of snow)
  snowPlowHrsPerKSFPerInch: number;     // plowing efficiency (hrs per 1,000 SF per inch of snow)
  snowEvents1_5in: number;          // # of events ≥1.5" per season (historical avg)
  snowEvents4in: number;            // # of events ≥4" per season (historical avg)
  snowEventsDusting: number;        // # of dusting/drift events (<1.5") per season
  snowEffSFPerHr1_5in: number;      // SF cleared per hour at 1.5" depth
  snowEffSFPerHr4in: number;        // SF cleared per hour at 4" depth
  // Snow efficiency tiers — editable SF and hours benchmarks
  snowPlow4inHrs: number;           // plowing hrs for 4"+ events
  snowPlow4inSF: number;            // SF of drivelanes/lots cleared in that time
  snowShovel4inHrs: number;         // shoveling hrs for 4"+ events
  snowShovel4inSF: number;          // SF of sidewalks cleared in that time
  snowPlow1_5inHrs: number;
  snowPlow1_5inSF: number;
  snowShovel1_5inHrs: number;
  snowShovel1_5inSF: number;
  snowPlowDustingHrs: number;
  snowPlowDustingSF: number;
  snowShovelDustingHrs: number;
  snowShovelDustingSF: number;
  fuelCostPerGallon: number;        // $/gallon for drive time fuel cost
  vehicleMpg: number;               // miles per gallon for service vehicle
}

// ─── App Data ─────────────────────────────────────────────────────────────────
export interface AppData {
  equipment: Equipment[];
  employees: Employee[];
  overhead: OverheadItem[];
  fieldSupplies: FieldSupply[];
  subcontractors: Subcontractor[];
  serviceCatalog: ServiceCatalogItem[];
  clients: Client[];
  leads: PipelineLead[];
  contracts: Contract[];
  projects: LandscapingProject[];
  snowTrips: SnowTrip[];
  invoices: Invoice[];
  timeEntries: TimeEntry[];
  expenses: ExpenseEntry[];
  crews: Crew[];
  futureBudget: FutureBudgetItem[];
  contractTemplates: ContractTemplate[];
  accountingCodes: AccountingCode[];
  settings: AppSettings;
  estimateCounter: number;
  invoiceCounter: number;
  projectCounter: number;
  requestCounter: number;
  jobCounter: number;
  snowTripCounter: number;
  requests: ServiceRequest[];
  salesTaxRates: SalesTaxRate[];
  jobs: Job[];
  savedAt?: string;   // ISO timestamp — set on every saveData() call, used to pick the newer copy
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
export function calcLineItemTotals(items: EstimateLineItem[]) {
  const active = items.filter(i => !i.optional);
  const subtotalRevenue = active.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalCost       = active.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const grossProfit     = subtotalRevenue - totalCost;
  const grossMargin     = subtotalRevenue > 0 ? (grossProfit / subtotalRevenue) * 100 : 0;
  return { subtotalRevenue, totalCost, grossProfit, grossMargin };
}

export function lineItemMargin(item: EstimateLineItem): number {
  const rev  = item.qty * item.unitPrice;
  const cost = item.qty * item.unitCost;
  return rev > 0 ? ((rev - cost) / rev) * 100 : 0;
}
