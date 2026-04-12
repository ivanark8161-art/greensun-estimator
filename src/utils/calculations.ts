import type { AppData, Contract, LandscapingProject, EstimateLineItem } from '../types';
import { MONTHS } from '../types';

// ─── Contract revenue recompute (mirrors QuoteDetail calculation) ─────────────
const SNOW_IDS_SET = new Set(['svc16','svc17','svc18','svc19','svc20','snow_trip']);
function isSnowLI(i: EstimateLineItem) {
  return SNOW_IDS_SET.has(i.catalogItemId ?? '') || i.isSnowPerTrip === true;
}

/** Recompute annualRevenue / monthlyRevenue from stored contract fields.
 *  Mirrors QuoteDetail's getBlendedRate() + revenue calculation exactly. */
export function recomputeContractRevenue(
  c: Contract,
  data: Pick<AppData, 'settings' | 'employees' | 'crews' | 'salesTaxRates'>,
): { annualRevenue: number; monthlyRevenue: number } {
  const s = data.settings;
  const burden = 1 + (s.payrollBurdenPercent ?? 13) / 100;

  // Mirror QuoteDetail's getBlendedRate() — sum of crew member rates × burden
  function getBlendedRate(): number {
    const crew = c.crewId ? data.crews.find(cr => cr.id === c.crewId) : null;
    if (crew && crew.memberIds.length > 0) {
      return data.employees.filter(e => crew.memberIds.includes(e.id)).reduce((s, e) => s + e.hourlyRate * burden, 0);
    }
    const crewRates = data.crews.filter(cr => cr.memberIds.length > 0).map(cr =>
      data.employees.filter(e => cr.memberIds.includes(e.id)).reduce((s, e) => s + e.hourlyRate * burden, 0)
    );
    return crewRates.length > 0
      ? crewRates.reduce((s, r) => s + r, 0) / crewRates.length
      : (s.laborRatePerHour ?? 22) * burden;
  }

  const activeItems = c.lineItems.filter(i => !i.optional);

  const recurringMaintRev = activeItems
    .filter(i => !isSnowLI(i) && !i.isOneTime)
    .reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const snowFlatRev = activeItems
    .filter(i => isSnowLI(i) && !i.isSnowPerTrip)
    .reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const oneTimeRev = activeItems
    .filter(i => !isSnowLI(i) && !!i.isOneTime)
    .reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

  // Drive time — same formula as QuoteDetail
  const miles          = c.milesFromShop ?? 0;
  const driveHrsRT     = miles > 0 ? (miles / (s.averageSpeedMph ?? 30)) * 2 : 0;
  const driveLaborCost = parseFloat((driveHrsRT * getBlendedRate()).toFixed(2));
  const driveGallons   = miles > 0 ? (miles / (s.vehicleMpg ?? 12)) * 2 : 0;
  const driveFuelCost  = parseFloat((driveGallons * (s.fuelCostPerGallon ?? 3.50)).toFixed(2));
  const drivePerTrip   = driveLaborCost + driveFuelCost;
  const snowTotalEvents  = (s.snowEvents1_5in ?? 10) + (s.snowEvents4in ?? 5);
  const maintDriveAnnual = drivePerTrip * (c.visitsPerMonth ?? 0) * (c.activeMonths?.length ?? 0);
  const snowDriveAnnual  = snowFlatRev > 0 ? drivePerTrip * snowTotalEvents : 0;
  const annualDriveCost  = parseFloat((maintDriveAnnual + snowDriveAnnual).toFixed(2));
  const driveCharge = annualDriveCost > 0 && s.targetMargin < 100
    ? parseFloat((annualDriveCost / (1 - s.targetMargin / 100)).toFixed(2))
    : annualDriveCost;

  const annualValue    = recurringMaintRev * (c.activeMonths?.length ?? 0) + snowFlatRev + oneTimeRev + driveCharge;
  const overheadAmt    = parseFloat((annualValue * (c.additionalOverheadPct ?? 0) / 100).toFixed(2));
  const consumablesAmt = parseFloat((annualValue * (c.consumablesPct ?? 0) / 100).toFixed(2));
  const afterDiscount  = Math.max(annualValue + overheadAmt + consumablesAmt - (c.discountAmount ?? 0), 0);

  // Tax — look up from taxRateId first, fall back to stored taxRate
  const effectiveTaxRate = c.taxRateId
    ? (data.salesTaxRates ?? []).find(r => r.id === c.taxRateId)?.rate ?? (c.taxRate ?? 0)
    : (c.taxRate ?? 0);
  const taxableAnnual = activeItems
    .filter(i => i.taxable && !i.isSnowPerTrip)
    .reduce((sum, i) => {
      if (isSnowLI(i) || i.isOneTime) return sum + i.qty * i.unitPrice;
      return sum + i.qty * i.unitPrice * (c.activeMonths?.length ?? 0);
    }, 0);
  const taxAmt   = parseFloat((taxableAnnual * effectiveTaxRate / 100).toFixed(2));
  const totalDue = parseFloat((afterDiscount + taxAmt).toFixed(2));

  return {
    annualRevenue:  totalDue,
    monthlyRevenue: totalDue > 0 ? parseFloat((totalDue / 12).toFixed(2)) : 0,
  };
}

// ─── Cost rollups (Current Business Costs) ────────────────────────────────────
export function calcTotalMonthlyOverhead(data: AppData): number {
  return (
    data.overhead.reduce((s, o) => s + o.monthlyCost, 0) +
    data.fieldSupplies.reduce((s, f) => s + f.unitCost * f.monthlyUsage, 0) +
    data.equipment.reduce((s, e) => s + (e.paymentType === 'monthly_payment' ? e.monthlyPaymentAmount : e.monthlyDepreciation), 0)
  );
}

export function calcMonthlyLaborCost(data: AppData): number {
  return data.employees.reduce((s, e) => s + e.hourlyRate * e.hoursPerWeek * 4.33, 0);
}

export function calcTotalMonthlyCost(data: AppData): number {
  return calcTotalMonthlyOverhead(data) + calcMonthlyLaborCost(data);
}

// ─── Revenue helpers ──────────────────────────────────────────────────────────
export function calcMonthlyRevenue(data: AppData): number {
  // Only count contracts active in the current calendar month
  const currentMonth = MONTHS[new Date().getMonth()];
  return data.contracts
    .filter(c => c.status === 'active' && c.activeMonths.includes(currentMonth))
    .reduce((s, c) => s + c.monthlyRevenue, 0);
}

export function calcAnnualRevenue(data: AppData): number {
  // Recalculate from live activeMonths so stale annualRevenue fields don't skew results
  return data.contracts
    .filter(c => c.status === 'active')
    .reduce((s, c) => s + c.monthlyRevenue * c.activeMonths.length, 0);
}

export function calcSnowSeasonRevenue(data: AppData): number {
  const s = data.settings;
  return data.snowTrips.reduce((sum, t) =>
    sum + (t.plowingHours * s.plowingRatePerHour)
        + (t.shovelingHours * s.shovelingRatePerHour)
        + (t.deicingBags * s.deicingRatePerBag), 0);
}

export function calcOutstandingInvoices(data: AppData): number {
  return data.invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + i.total, 0);
}

export function calcCollectedRevenue(data: AppData): number {
  return data.invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + i.paidAmount, 0);
}

// ─── Job Costing ─────────────────────────────────────────────────────────────
export interface JobCostSummary {
  estimatedCost: number;
  estimatedRevenue: number;
  estimatedHours: number;
  actualCost: number;      // from time entries + expenses
  actualHours: number;     // from time entries
  actualExpenses: number;  // from expense entries
  projectedCost: number;   // estimated hours/visit × labor rate × visits remaining
  variance: number;        // estimatedCost - actualCost (positive = under budget)
  margin: number;          // (revenue - actualCost) / revenue * 100
}

export function calcJobCostingForContract(
  contract: Contract,
  data: AppData,
  month?: number, // 0-indexed; undefined = all time
  year?: number,
): JobCostSummary {
  const laborRate = data.settings.laborRatePerHour;

  const timeEntries = data.timeEntries.filter(t => {
    if (t.jobId !== contract.id) return false;
    if (month !== undefined && year !== undefined) {
      const d = new Date(t.date);
      return d.getMonth() === month && d.getFullYear() === year;
    }
    return true;
  });

  const expenses = data.expenses.filter(e => {
    if (e.jobId !== contract.id) return false;
    if (month !== undefined && year !== undefined) {
      const d = new Date(e.date);
      return d.getMonth() === month && d.getFullYear() === year;
    }
    return true;
  });

  const actualHours    = timeEntries.reduce((s, t) => s + t.hours, 0);
  const actualExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const actualCost     = actualHours * laborRate + actualExpenses;

  // Projected: use actual avg hrs/visit if we have data, else estimatedHoursPerVisit
  const hoursPerVisit  = contract.estimatedHoursPerVisit ?? 2;
  const projectedCost  = hoursPerVisit * contract.visitsPerMonth * laborRate;

  const estimatedRevenue = contract.monthlyRevenue;
  const estimatedCost    = contract.totalCost;
  const estimatedHours   = hoursPerVisit * contract.visitsPerMonth;

  return {
    estimatedCost,
    estimatedRevenue,
    estimatedHours,
    actualCost,
    actualHours,
    actualExpenses,
    projectedCost,
    variance: estimatedCost - actualCost,
    margin: estimatedRevenue > 0 ? ((estimatedRevenue - actualCost) / estimatedRevenue) * 100 : 0,
  };
}

export function calcJobCostingForProject(
  project: LandscapingProject,
  data: AppData,
): JobCostSummary {
  const laborRate = data.settings.laborRatePerHour;

  const timeEntries = data.timeEntries.filter(t => t.jobId === project.id);
  const expenses    = data.expenses.filter(e => e.jobId === project.id);

  const actualHours    = timeEntries.reduce((s, t) => s + t.hours, 0);
  const actualExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const actualCost     = actualHours * laborRate + actualExpenses;

  const estimatedHours = project.estimatedHours;
  const estimatedCost  = project.totalCost;
  const projectedCost  = estimatedHours * laborRate + project.estimatedMaterialCost;

  return {
    estimatedCost,
    estimatedRevenue: project.subtotalRevenue,
    estimatedHours,
    actualCost,
    actualHours,
    actualExpenses,
    projectedCost,
    variance: estimatedCost - actualCost,
    margin: project.subtotalRevenue > 0
      ? ((project.subtotalRevenue - actualCost) / project.subtotalRevenue) * 100
      : 0,
  };
}

// ─── Monthly P&L ──────────────────────────────────────────────────────────────
export function calcMonthlyPnL(data: AppData, month: number, year: number) {
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const laborRate   = data.settings.laborRatePerHour;

  // Revenue from active contracts (billing that month)
  const contractRevenue = data.contracts
    .filter(c => c.status === 'active')
    .reduce((s, c) => s + c.monthlyRevenue, 0);

  // Snow revenue that month
  const { plowingRatePerHour, shovelingRatePerHour, deicingRatePerBag } = data.settings;
  const snowRevenue = data.snowTrips
    .filter(t => {
      const d = new Date(t.serviceDate);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((s, t) =>
      s + (t.plowingHours * plowingRatePerHour)
        + (t.shovelingHours * shovelingRatePerHour)
        + (t.deicingBags * deicingRatePerBag), 0);

  // Actual time entries that month
  const monthTimeEntries = data.timeEntries.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const actualHours    = monthTimeEntries.reduce((s, t) => s + t.hours, 0);
  const actualLaborCost = actualHours * laborRate;

  // Actual expenses that month
  const monthExpenses = data.expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const actualExpenses = monthExpenses.reduce((s, e) => s + e.amount, 0);

  // Business overhead (monthly fixed)
  const fixedOverhead = calcTotalMonthlyOverhead(data);

  const totalRevenue = contractRevenue + snowRevenue;
  const totalCost    = actualLaborCost + actualExpenses + fixedOverhead;
  const netProfit    = totalRevenue - totalCost;
  const margin       = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    label: `${MONTH_NAMES[month]} ${year}`,
    contractRevenue,
    snowRevenue,
    totalRevenue,
    actualLaborCost,
    actualExpenses,
    fixedOverhead,
    totalCost,
    netProfit,
    margin,
    actualHours,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function generateEstimateNumber(counter: number): string {
  const year = new Date().getFullYear().toString().slice(2);
  return `${year}-${String(counter).padStart(3, '0')}`;
}

export function generateRequestNumber(counter: number): string {
  const year = new Date().getFullYear().toString().slice(2);
  return `${year}-${String(counter).padStart(3, '0')}`;
}

export function generateProjectNumber(counter: number): string {
  const year = new Date().getFullYear().toString().slice(2);
  return `P${year}-${String(counter).padStart(3, '0')}`;
}
