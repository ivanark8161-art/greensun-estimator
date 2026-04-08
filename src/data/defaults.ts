import type { AppData, EstimateLineItem } from '../types';

const laQuintaLineItems: EstimateLineItem[] = [
  { id: 'lq1', catalogItemId: 'svc1',  name: 'Lawn Mowing',              description: 'All turf areas — 25,000 sq ft', qty: 4, unit: 'visit',       unitCost: 68,  unitPrice: 125, optional: false, taxable: false, notes: '' },
  { id: 'lq2', catalogItemId: 'svc2',  name: 'Weed Whipping / Trimming', description: 'Perimeter & spot trimming',       qty: 4, unit: 'visit',       unitCost: 28,  unitPrice: 55,  optional: false, taxable: false, notes: '' },
  { id: 'lq3', catalogItemId: 'svc3',  name: 'Blowing Hard Surfaces',    description: 'Parking lots, walks, entries',    qty: 4, unit: 'visit',       unitCost: 12,  unitPrice: 25,  optional: false, taxable: false, notes: '' },
  { id: 'lq4', catalogItemId: 'svc7',  name: 'Spring Cleanup',            description: 'Debris removal, sand/salt',       qty: 1, unit: 'each',        unitCost: 150, unitPrice: 250, optional: false, taxable: false, notes: '' },
  { id: 'lq5', catalogItemId: 'svc5',  name: 'Fertilizer Application',   description: '2x per season',                  qty: 2, unit: 'application', unitCost: 65,  unitPrice: 120, optional: false, taxable: false, notes: '' },
  { id: 'lq6', catalogItemId: 'svc8',  name: 'Fall Cleanup / Leaf Removal', description: 'Leaf blowing and removal',     qty: 1, unit: 'each',        unitCost: 150, unitPrice: 250, optional: false, taxable: false, notes: '' },
  { id: 'lq7', catalogItemId: 'svc20', name: 'Snow Removal (Monthly)',   description: 'Per storm plowing + shoveling',  qty: 1, unit: 'month',       unitCost: 280, unitPrice: 500, optional: false, taxable: false, notes: 'Winter months only. Per-trip charges apply.' },
  { id: 'lq8', catalogItemId: 'svc18', name: 'De-icing Material',        description: 'Ice melt — pass-through',        qty: 4, unit: 'bag',         unitCost: 14,  unitPrice: 25,  optional: false, taxable: false, notes: 'Estimated avg bags/month. Adjusted per actual usage.' },
];

const millsLineItems: EstimateLineItem[] = [
  { id: 'mc1', catalogItemId: 'svc1',  name: 'Lawn Mowing',              description: 'All turf areas — 15,000 sq ft', qty: 4, unit: 'visit',       unitCost: 42, unitPrice: 80,  optional: false, taxable: false, notes: '' },
  { id: 'mc2', catalogItemId: 'svc2',  name: 'Weed Whipping / Trimming', description: 'Perimeter & spot trimming',      qty: 4, unit: 'visit',       unitCost: 20, unitPrice: 38,  optional: false, taxable: false, notes: '' },
  { id: 'mc3', catalogItemId: 'svc3',  name: 'Blowing Hard Surfaces',    description: 'Sidewalks, parking, entries',    qty: 4, unit: 'visit',       unitCost: 8,  unitPrice: 18,  optional: false, taxable: false, notes: '' },
  { id: 'mc4', catalogItemId: 'svc7',  name: 'Spring Cleanup',            description: 'Debris removal, sand/salt',      qty: 1, unit: 'each',        unitCost: 100,unitPrice: 175, optional: false, taxable: false, notes: '' },
  { id: 'mc5', catalogItemId: 'svc5',  name: 'Fertilizer Application',   description: '2x per season',                  qty: 2, unit: 'application', unitCost: 45, unitPrice: 85,  optional: false, taxable: false, notes: '' },
  { id: 'mc6', catalogItemId: 'svc8',  name: 'Fall Cleanup / Leaf Removal', description: 'Leaf blowing and removal',    qty: 1, unit: 'each',        unitCost: 100,unitPrice: 175, optional: false, taxable: false, notes: '' },
];

export const DEFAULT_DATA: AppData = {
  estimateCounter: 7,
  invoiceCounter: 1,
  projectCounter: 1,
  requestCounter: 0,
  requests: [],
  salesTaxRates: [],

  settings: {
    targetMargin: 20,
    defaultWorkingDaysPerMonth: 20,
    laborRatePerHour: 22,
    mowingRateSFPerHour: 26983,
    weedWhippingFtPerHour: 600,
    blowingRateSFPerHour: 20000,
    travelTimeMinutes: 20,
    setupCleanupMinutes: 15,
    defaultTaxRate: 0,
    defaultPaymentTermsDays: 30,
    plowingRatePerHour: 125,
    shovelingRatePerHour: 35,
    deicingRatePerBag: 25,
    plowingCostPerHour: 65,
    shovelingCostPerHour: 15,
    deicingCostPerBag: 14,
    shopName: 'GreenSun Shop',
    shopAddress: 'Minneapolis, MN',
    averageSpeedMph: 30,
    payrollBurdenPercent: 13,
    consumablesPercent: 3,
    overheadMarkupPercent: 3,
    snowSidewalkHrsPerKSFPerInch: 0.1111,  // 1 hr per 6,000 SF at 1.5" snow → 1/(6×1.5)
    snowPlowHrsPerKSFPerInch: 0.01515,     // 1 hr per 44,000 SF at 1.5" snow → 1/(44×1.5)
    snowEvents1_5in: 10,
    snowEvents4in: 5,
    snowEffSFPerHr1_5in: 44000,
    snowEffSFPerHr4in: 30000,
    fuelCostPerGallon: 3.50,
    vehicleMpg: 12,
  },

  serviceCatalog: [
    // ── Maintenance — priced per 1,000 sq ft ──
    // Lawn Mowing bundles mowing + perimeter weed whipping + hard surface blowing.
    // Efficiency: 1 hr per 26,983 SF (= 0.0371 hrs/1,000 SF) measured by GreenSun.
    { id: 'svc1',  name: 'Lawn Mowing',              description: 'Mow all turf · perimeter weed whipping · hard surface blowing', category: 'maintenance', unit: '1,000 sq ft',  defaultUnitCost: 3.50, defaultUnitPrice: 6.50,  estimatedHours: 0.0371, equipmentIds: ['eq2','eq3','eq4','eq5','eq6','eq7'], taxable: false, notes: 'Bundled service. Cost & hours per 1,000 sq ft of turf. Auto-generate accounts for actual perimeter and hardscape.' },
    { id: 'svc4',  name: 'Edging',                   description: 'Edge sidewalks and bed borders',   category: 'maintenance', unit: '1,000 lin ft', defaultUnitCost: 4.00, defaultUnitPrice: 7.50,  estimatedHours: 0.10, equipmentIds: [], taxable: false, notes: 'Based on linear footage — recurring per visit' },
    { id: 'svc5',  name: 'Fertilizer Application',   description: 'Granular or liquid fertilizer',    category: 'maintenance', unit: '1,000 sq ft',  defaultUnitCost: 2.75, defaultUnitPrice: 5.00,  estimatedHours: 0.025, equipmentIds: [], taxable: false, notes: 'Seasonal — qty = SF/1,000 × applications' },
    { id: 'svc6',  name: 'Weed Control Spray',       description: 'Spot spray & perimeter',           category: 'maintenance', unit: '1,000 sq ft',  defaultUnitCost: 2.00, defaultUnitPrice: 3.75,  estimatedHours: 0.03, equipmentIds: [], taxable: false, notes: 'Seasonal — qty = SF/1,000 × applications' },
    { id: 'svc7',  name: 'Spring Cleanup',            description: 'Debris removal, sand/salt cleanup',category: 'maintenance', unit: '1,000 sq ft',  defaultUnitCost: 6.00, defaultUnitPrice: 10.00, estimatedHours: 0.10, equipmentIds: ['eq5','eq6'], taxable: false, notes: 'One-time per season — qty = SF/1,000' },
    { id: 'svc8',  name: 'Fall Cleanup',              description: 'Leaf removal, final mow, blow',    category: 'maintenance', unit: '1,000 sq ft',  defaultUnitCost: 6.00, defaultUnitPrice: 10.00, estimatedHours: 0.10, equipmentIds: ['eq5','eq6'], taxable: false, notes: 'One-time per season — qty = SF/1,000' },
    { id: 'svc9',  name: 'Leaf Removal',              description: 'Blow and bag/haul leaves',         category: 'maintenance', unit: '1,000 sq ft',  defaultUnitCost: 3.50, defaultUnitPrice: 6.50,  estimatedHours: 0.05, equipmentIds: ['eq6'], taxable: false, notes: 'Per occurrence — qty = SF/1,000' },
    { id: 'svc10', name: 'Bush / Hedge Trimming',    description: 'Trim all shrubs and hedges',       category: 'landscaping', unit: 'hour',        defaultUnitCost: 30,   defaultUnitPrice: 75,   estimatedHours: 1.0, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc11', name: 'Mulch Installation',        description: 'Install mulch in landscape beds',  category: 'landscaping', unit: 'cu yd',       defaultUnitCost: 35,   defaultUnitPrice: 75,   estimatedHours: 0.5, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc12', name: 'Tree Trimming',             description: 'Trim and shape trees',             category: 'landscaping', unit: 'man-hour',    defaultUnitCost: 40,   defaultUnitPrice: 95,   estimatedHours: 1.0, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc13', name: 'Sod Installation',          description: 'Install new sod',                  category: 'landscaping', unit: 'sq ft',       defaultUnitCost: 0.80, defaultUnitPrice: 2.50, estimatedHours: 0.01, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc14', name: 'Overseeding',               description: 'Overseed thin or bare areas',      category: 'landscaping', unit: 'sq ft',       defaultUnitCost: 0.05, defaultUnitPrice: 0.15, estimatedHours: 0.005, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc15', name: 'Rock / Stone Installation',description: 'Install decorative stone or rock', category: 'landscaping', unit: 'sq ft',       defaultUnitCost: 4,    defaultUnitPrice: 10,   estimatedHours: 0.05, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc16', name: 'Snow Plowing',              description: 'Plow truck — per hour on-site',    category: 'snow',        unit: 'hour',        defaultUnitCost: 65,   defaultUnitPrice: 125,  estimatedHours: 1.0, equipmentIds: ['eq1'], taxable: false, notes: '' },
    { id: 'svc17', name: 'Snow Shoveling',            description: 'Manual shoveling — walks/entries', category: 'snow',        unit: 'hour',        defaultUnitCost: 15,   defaultUnitPrice: 35,   estimatedHours: 1.0, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc18', name: 'De-icing Material',         description: 'Ice melt — bagged salt',           category: 'snow',        unit: 'bag',         defaultUnitCost: 14,   defaultUnitPrice: 25,   estimatedHours: 0.1, equipmentIds: ['eq9'], taxable: false, notes: '' },
    { id: 'svc19', name: 'Fire Hydrant Clearing',    description: 'Clear 2 ft around hydrants',       category: 'snow',        unit: 'each',        defaultUnitCost: 8,    defaultUnitPrice: 20,   estimatedHours: 0.25, equipmentIds: [], taxable: false, notes: '' },
    { id: 'svc20', name: 'Snow Removal (Monthly Flat)', description: 'Flat monthly winter rate',      category: 'snow',        unit: 'month',       defaultUnitCost: 300,  defaultUnitPrice: 550,  estimatedHours: 8.0, equipmentIds: ['eq1','eq8','eq9'], taxable: false, notes: '' },
  ],

  clients: [
    {
      id: 'cl1',
      companyName: 'LaQuinta Hotel Minnetonka',
      type: 'commercial' as const,
      contacts: [{ id: 'clc1', title: '', firstName: 'Property', lastName: 'Manager', role: 'Property Manager', phone: '', email: '', isPrimary: true }],
      properties: [{ id: 'clp1', street1: 'LaQuinta Inn & Suites', street2: '', city: 'Minnetonka', state: 'MN', zip: '', taxRateId: undefined, isBillingAddress: true, contactIds: ['clc1'], notes: 'Year-round contract. Purchased through HMS PO#1 package deal.' }],
      leadSource: 'hms' as const,
      tags: [],
      notes: 'Year-round contract. Includes buy-back clause of $5,000 from HMS PO#1.',
      createdAt: '2026-02-09T00:00:00.000Z',
    },
    {
      id: 'cl2',
      companyName: 'Mills Church',
      type: 'commercial' as const,
      contacts: [],
      properties: [{ id: 'clp2', street1: '', street2: '', city: 'Minneapolis', state: 'MN', zip: '', taxRateId: undefined, isBillingAddress: true, contactIds: [], notes: 'Spring/Summer/Fall. Winter per-trip billing.' }],
      leadSource: '' as const,
      tags: [],
      notes: 'Spring/Summer/Fall maintenance. Winter billed per-trip separately.',
      createdAt: '2026-02-22T00:00:00.000Z',
    },
  ],

  leads: [],
  projects: [],
  timeEntries: [],
  expenses: [],

  equipment: [
    { id: 'eq1', name: '2011 Ford F-350 (Plow Truck)',   purchaseDate: '2026-02-05', purchaseCost: 22000, usefulLifeYears: 5,  monthlyDepreciation: 458, monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['spring','summer','fall','winter'], notes: 'Purchased from HMS via PO#1. Includes plow.' },
    { id: 'eq2', name: '61" Stand-Up Ride-Along Mower', purchaseDate: '2026-02-05', purchaseCost: 500,   usefulLifeYears: 5,  monthlyDepreciation: 10,  monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['spring','summer','fall'],           notes: 'Primary mower.' },
    { id: 'eq3', name: '51" Ride-Along Mower',           purchaseDate: '2026-02-05', purchaseCost: 500,   usefulLifeYears: 5,  monthlyDepreciation: 10,  monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['spring','summer','fall'],           notes: 'Secondary mower.' },
    { id: 'eq4', name: '31" Push Mower',                 purchaseDate: '2026-01-01', purchaseCost: 350,   usefulLifeYears: 4,  monthlyDepreciation: 9,   monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['spring','summer','fall'],           notes: 'Tight areas.' },
    { id: 'eq5', name: '2025 Enclosed Trailer',          purchaseDate: '2026-01-01', purchaseCost: 8000,  usefulLifeYears: 10, monthlyDepreciation: 100, monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['spring','summer','fall','winter'], notes: '' },
    { id: 'eq6', name: 'Backpack Blowers (x2)',          purchaseDate: '2026-01-01', purchaseCost: 900,   usefulLifeYears: 4,  monthlyDepreciation: 23,  monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['spring','summer','fall'],           notes: '' },
    { id: 'eq7', name: 'Weed Whips (x2)',                purchaseDate: '2026-01-01', purchaseCost: 600,   usefulLifeYears: 4,  monthlyDepreciation: 15,  monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['spring','summer','fall'],           notes: '' },
    { id: 'eq8', name: 'Snow Blower',                    purchaseDate: '2026-01-01', purchaseCost: 800,   usefulLifeYears: 5,  monthlyDepreciation: 17,  monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['winter'],                          notes: '' },
    { id: 'eq9', name: 'Push Salt Machines (x2)',        purchaseDate: '2026-01-01', purchaseCost: 300,   usefulLifeYears: 4,  monthlyDepreciation: 8,   monthlyMaintenancePct: 5, paymentType: 'paid_in_full', monthlyPaymentAmount: 0, seasons: ['winter'],                          notes: '' },
  ],

  employees: [
    { id: 'emp1', name: 'Ian VanArk',    role: 'Co-Owner / Operations', hourlyRate: 25, hoursPerWeek: 40, isOwner: true,  startDate: '2025-01-01', notes: '' },
    { id: 'emp2', name: 'Sam Reichel',   role: 'Co-Owner / Sales',      hourlyRate: 25, hoursPerWeek: 40, isOwner: true,  startDate: '2025-01-01', notes: '' },
    { id: 'emp3', name: 'Isaac Richert', role: 'VP / Field Supervisor',  hourlyRate: 22, hoursPerWeek: 40, isOwner: false, startDate: '2025-06-01', notes: '' },
  ],

  overhead: [
    { id: 'oh1',  category: 'software',  name: 'QuickBooks Online',   monthlyCost: 50,  notes: '' },
    { id: 'oh2',  category: 'software',  name: 'Microsoft 365',       monthlyCost: 150, notes: '' },
    { id: 'oh3',  category: 'software',  name: 'Squarespace Website', monthlyCost: 25,  notes: '' },
    { id: 'oh4',  category: 'insurance', name: 'General Liability',   monthlyCost: 150, notes: '' },
    { id: 'oh5',  category: 'insurance', name: 'Commercial Auto',     monthlyCost: 200, notes: '' },
    { id: 'oh6',  category: 'insurance', name: 'Workers Comp',        monthlyCost: 100, notes: '' },
    { id: 'oh7',  category: 'insurance', name: 'Inland Marine',       monthlyCost: 50,  notes: '' },
    { id: 'oh8',  category: 'insurance', name: 'Umbrella Policy',     monthlyCost: 40,  notes: '' },
    { id: 'oh9',  category: 'license',   name: 'MN Business License', monthlyCost: 10,  notes: 'Annual ÷ 12' },
    { id: 'oh10', category: 'license',   name: 'Fertilizer License',  monthlyCost: 5,   notes: 'Annual ÷ 12' },
    { id: 'oh11', category: 'office',    name: 'Phone / Cell Plans',  monthlyCost: 120, notes: '' },
    { id: 'oh12', category: 'office',    name: 'Office Supplies',     monthlyCost: 30,  notes: '' },
  ],

  fieldSupplies: [
    { id: 'fs1', category: 'fuel',     name: 'Diesel (Truck)',          unit: 'gallon', unitCost: 3.80, monthlyUsage: 60 },
    { id: 'fs2', category: 'fuel',     name: 'Gas (Mowers/Equipment)',  unit: 'gallon', unitCost: 3.40, monthlyUsage: 20 },
    { id: 'fs3', category: 'material', name: 'Ice Melt / Salt',         unit: 'bag',    unitCost: 14,   monthlyUsage: 0  },
    { id: 'fs4', category: 'material', name: 'Fertilizer',              unit: 'bag',    unitCost: 45,   monthlyUsage: 0  },
    { id: 'fs5', category: 'gear',     name: 'Work Gloves',             unit: 'pair',   unitCost: 12,   monthlyUsage: 3  },
    { id: 'fs6', category: 'gear',     name: 'Safety Vests',            unit: 'each',   unitCost: 25,   monthlyUsage: 1  },
  ],

  contracts: [
    {
      id: 'c1', estimateNumber: '26003', clientId: 'cl1',
      clientName: 'LaQuinta Hotel Minnetonka', propertyType: 'commercial',
      address: 'Minnetonka, MN', turfSF: 25000, hardscapeSF: 15000, perimeterFt: 800,
      lineItems: laQuintaLineItems, visitsPerMonth: 4,
      activeMonths: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
      subtotalRevenue: 1600, totalCost: 1200, grossMargin: 25,
      monthlyRevenue: 1600, annualRevenue: 19200,
      estimatedHoursPerVisit: 3.5,
      scheduledDay: 2, scheduledTime: '08:00', scheduledDurationMinutes: 180,
      crewId: 'crew1',
      taxRate: 0, discountAmount: 0, additionalOverheadPct: 0, consumablesPct: 0, downPaymentRequired: 0,
      startDate: '2026-03-01', endDate: '2027-02-28', status: 'active',
      notes: 'Year-round contract. Includes buy-back clause of $5,000 from HMS PO#1.',
      terms: 'Net 30. Late payment: 1.5%/month (18% annual).',
      createdAt: '2026-02-09T00:00:00.000Z',
    },
    {
      id: 'c2', estimateNumber: '26006', clientId: 'cl2',
      clientName: 'Mills Church', propertyType: 'commercial',
      address: 'Minneapolis, MN', turfSF: 15000, hardscapeSF: 8000, perimeterFt: 600,
      lineItems: millsLineItems, visitsPerMonth: 4,
      activeMonths: ['mar','apr','may','jun','jul','aug','sep','oct','nov'],
      subtotalRevenue: 900, totalCost: 648, grossMargin: 28,
      monthlyRevenue: 900, annualRevenue: 8100,
      estimatedHoursPerVisit: 2.5,
      scheduledDay: 4, scheduledTime: '09:00', scheduledDurationMinutes: 120,
      crewId: 'crew1',
      taxRate: 0, discountAmount: 0, additionalOverheadPct: 0, consumablesPct: 0, downPaymentRequired: 0,
      startDate: '2026-03-01', endDate: '2027-02-28', status: 'active',
      notes: 'Spring/Summer/Fall maintenance. Winter billed per-trip separately.',
      terms: 'Net 30. Late payment: 1.5%/month (18% annual).',
      createdAt: '2026-02-22T00:00:00.000Z',
    },
  ],

  snowTrips: [],
  invoices: [],

  crews: [
    {
      id: 'crew1', name: 'Crew Alpha',
      memberIds: ['emp1','emp2','emp3'],
      equipmentIds: ['eq1','eq2','eq5','eq6','eq7'],
      contractIds: ['c1','c2'],
      notes: 'Primary crew covering both current commercial accounts.',
    },
  ],

  futureBudget: [],

  contractTemplates: [
    {
      id: 'tmpl1',
      name: 'Maintenance Agreement',
      type: 'maintenance',
      updatedAt: '2026-01-01',
      content: `LANDSCAPE MAINTENANCE AGREEMENT

This Landscape Maintenance Agreement ("Agreement") is entered into between GreenSun Landscapes LLC ("Contractor") and the client named in the attached estimate ("Client").

SCOPE OF SERVICES
Contractor agrees to perform the landscape maintenance services described in the attached estimate at the agreed frequency and price. All services are subject to weather conditions and site accessibility.

PAYMENT TERMS
Client agrees to pay the monthly maintenance fee on or before the 1st of each service month. Invoices are due within 30 days. A late fee of 1.5% per month may be applied to overdue balances.

TERM & RENEWAL
This Agreement is effective for the service season(s) indicated in the estimate. It will automatically renew unless either party provides 30 days written notice of cancellation.

ADDITIONAL SERVICES
Work outside the scope of this Agreement will be quoted separately and requires written approval before proceeding.

PROPERTY ACCESS
Client shall ensure Contractor has reasonable access to the property on scheduled service days. GreenSun is not responsible for missed visits caused by locked gates, vehicles blocking access, or unsafe conditions.

DAMAGE & LIABILITY
Contractor carries general liability insurance and workers compensation. GreenSun is not liable for pre-existing conditions, underground utilities not marked by the appropriate authority, or damage caused by acts of nature.

TERMINATION
Either party may terminate this Agreement with 30 days written notice. Client remains responsible for fees incurred prior to the termination date.

By signing the attached estimate, Client agrees to the terms of this Agreement.

GreenSun Landscapes LLC
Ian VanArk | Sam Reichel
info@greensunlandscapes.com`,
    },
    {
      id: 'tmpl2',
      name: 'Landscaping Project Agreement',
      type: 'landscaping',
      updatedAt: '2026-01-01',
      content: `LANDSCAPING PROJECT AGREEMENT

This Project Agreement ("Agreement") is entered into between GreenSun Landscapes LLC ("Contractor") and the client named in the attached estimate ("Client").

SCOPE OF WORK
Contractor agrees to complete the landscaping project as described in the attached estimate. Any changes to scope require a written change order signed by both parties before additional work begins.

PAYMENT SCHEDULE
• Deposit: 50% due upon signed agreement before work begins
• Final payment: 50% due upon project completion
• Change orders are invoiced separately upon completion

MATERIALS
All materials specified are subject to availability. Contractor may substitute equivalent materials with prior notice. Client-supplied materials are not covered under Contractor's warranty.

PROJECT TIMELINE
Contractor will provide an estimated start date after receipt of deposit. Timelines are subject to weather, permit approvals, and material lead times. GreenSun will communicate any delays promptly.

WARRANTY
Contractor warrants all labor for 90 days from project completion. Plant material warranty is 30 days (subject to proper watering by Client). Hardscape warranty is 1 year for workmanship defects.

SITE CONDITIONS
Client is responsible for marking or identifying underground utilities, irrigation lines, and other obstructions. Contractor is not liable for damage to unmarked utilities.

CLEANUP
Contractor will remove all job-related debris upon project completion. Existing debris, materials, or structures removed at Client's request are included in the project scope.

TERMINATION
If Client cancels after work has begun, Client is responsible for all costs incurred to date plus 15% of remaining contract value.

By signing the attached estimate, Client agrees to the terms of this Agreement.

GreenSun Landscapes LLC
Ian VanArk | Sam Reichel
info@greensunlandscapes.com`,
    },
    {
      id: 'tmpl3',
      name: 'Snow Removal Agreement',
      type: 'snow',
      updatedAt: '2026-01-01',
      content: `SNOW REMOVAL SERVICE AGREEMENT

This Snow Removal Agreement ("Agreement") is entered into between GreenSun Landscapes LLC ("Contractor") and the client named in the attached estimate ("Client").

SCOPE OF SERVICES
Contractor will provide snow plowing, shoveling, and/or de-icing services at the property address listed in the estimate. Services are triggered when snowfall meets the threshold specified in the estimate (default: 2 inches accumulation).

SERVICE TIMING
Contractor will service the property as soon as practical during and after qualifying snow events. Priority routing is determined by Contractor. GreenSun targets completion within 4 hours of storm end for commercial accounts.

PRICING
Services are billed per event at the rates specified in the estimate. De-icing material is billed at actual usage. Monthly retainer pricing (where applicable) covers a set number of events; additional events are billed at per-trip rates.

PAYMENT TERMS
Invoices are issued after each snow event or monthly (as specified). Payment is due within 15 days of invoice date. A late fee of 1.5%/month applies to overdue balances.

CLIENT RESPONSIBILITIES
• Vehicles must be removed from lots/drives by the agreed service time
• Contractor is not responsible for damage to unmarked curbs, speed bumps, or other obstructions buried under snow
• Client must notify Contractor of any changes to priority areas in writing

LIABILITY
Contractor is not liable for slip-and-fall incidents occurring after services have been rendered if conditions return due to continued precipitation or temperature changes. Contractor carries general liability insurance.

SEASON TERM
This Agreement covers the winter season indicated in the estimate. It will renew automatically for subsequent seasons unless cancelled in writing by September 1st.

By signing the attached estimate, Client agrees to the terms of this Agreement.

GreenSun Landscapes LLC
Ian VanArk | Sam Reichel
info@greensunlandscapes.com`,
    },
  ],
};
