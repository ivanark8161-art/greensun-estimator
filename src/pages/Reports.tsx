import { useState } from 'react';
import type { AppData } from '../types';
import {
  calcMonthlyPnL, calcJobCostingForContract, calcJobCostingForProject,
  calcOutstandingInvoices, contractHasActiveJob, formatCurrency, formatPercent,
} from '../utils/calculations';
import PageHeader from '../components/PageHeader';

interface Props { data: AppData }

type ReportTab = 'pnl' | 'jobcosting' | 'crew' | 'forecast' | 'codes';

// ─── Monthly P&L ──────────────────────────────────────────────────────────────
function PnLReport({ data }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(now.getFullYear());

  const pnl = calcMonthlyPnL(data, month, year);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const YEARS  = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const targetRevenue = pnl.totalRevenue * (data.settings.targetMargin / 100);
  const marginOk = pnl.margin >= data.settings.targetMargin;

  return (
    <div>
      {/* Picker */}
      <div className="flex gap-3 mb-6">
        <select className="input max-w-[180px]" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select className="input max-w-[100px]" value={year} onChange={e => setYear(Number(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-[#27AE60]">{formatCurrency(pnl.totalRevenue)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Costs</p>
          <p className="text-2xl font-bold text-red-500">{formatCurrency(pnl.totalCost)}</p>
        </div>
        <div className={`card text-center ${pnl.netProfit >= 0 ? '' : 'border-red-200'}`}>
          <p className="text-xs text-gray-500 mb-1">Net Profit</p>
          <p className={`text-2xl font-bold ${pnl.netProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrency(pnl.netProfit)}</p>
        </div>
        <div className={`card text-center ${marginOk ? 'border-green-200' : 'border-yellow-200'}`}>
          <p className="text-xs text-gray-500 mb-1">Margin</p>
          <p className={`text-2xl font-bold ${marginOk ? 'text-[#27AE60]' : 'text-yellow-600'}`}>{formatPercent(pnl.margin)}</p>
          <p className="text-xs text-gray-400">target: {data.settings.targetMargin}%</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Revenue Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Contract Revenue</span>
              <span className="font-semibold text-gray-900">{formatCurrency(pnl.contractRevenue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Snow Removal</span>
              <span className="font-semibold text-gray-900">{formatCurrency(pnl.snowRevenue)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between text-sm font-bold">
              <span>Total Revenue</span>
              <span className="text-[#27AE60]">{formatCurrency(pnl.totalRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Costs */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Cost Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Labor ({pnl.actualHours.toFixed(1)} hrs × ${data.settings.laborRatePerHour}/hr)</span>
              <span className="font-semibold text-gray-900">{formatCurrency(pnl.actualLaborCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Actual Expenses</span>
              <span className="font-semibold text-gray-900">{formatCurrency(pnl.actualExpenses)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Fixed Overhead</span>
              <span className="font-semibold text-gray-900">{formatCurrency(pnl.fixedOverhead)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between text-sm font-bold">
              <span>Total Costs</span>
              <span className="text-red-500">{formatCurrency(pnl.totalCost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Target margin bar */}
      <div className="card mt-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Profit vs Target Margin ({data.settings.targetMargin}%)</span>
          <span className={marginOk ? 'text-green-600 font-semibold' : 'text-yellow-600 font-semibold'}>
            {marginOk ? `+${formatPercent(pnl.margin - data.settings.targetMargin)} above target` : `${formatPercent(data.settings.targetMargin - pnl.margin)} below target`}
          </span>
        </div>
        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${marginOk ? 'bg-[#27AE60]' : 'bg-yellow-400'}`}
            style={{ width: `${Math.min((pnl.netProfit / (targetRevenue || 1)) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>$0</span>
          <span>Target: {formatCurrency(targetRevenue)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Job Costing ──────────────────────────────────────────────────────────────
function JobCostingReport({ data }: Props) {
  // Only include contracts that have a linked active job
  const contractRows = data.contracts
    .filter(c => data.jobs.some(j => j.contractId === c.id && j.status === 'active'))
    .map(c => ({
      id: c.id,
      name: c.clientName,
      type: 'Contract' as const,
      status: c.status,
      summary: calcJobCostingForContract(c, data),
    }));

  const projectRows = data.projects.map(p => ({
    id: p.id,
    name: `${p.projectNumber} · ${p.clientName}`,
    type: 'Project' as const,
    status: p.status,
    summary: calcJobCostingForProject(p, data),
  }));

  const allRows = [...contractRows, ...projectRows];

  function varianceBadge(variance: number) {
    if (variance > 0) return <span className="text-xs font-semibold text-green-600">+{formatCurrency(variance)} under</span>;
    if (variance < 0) return <span className="text-xs font-semibold text-red-500">{formatCurrency(variance)} over</span>;
    return <span className="text-xs text-gray-400">on budget</span>;
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">All-time job costing: estimated vs actual hours and costs across all contracts and projects.</p>
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Job','Type','Est. Hours','Actual Hrs','Est. Cost','Actual Cost','Projected','Variance','Margin'].map(h => (
                <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allRows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">No jobs to display</td></tr>
            ) : allRows.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <p className="font-medium text-gray-900 leading-tight">{row.name}</p>
                  <span className={`text-xs capitalize px-1.5 py-0.5 rounded-full ${
                    row.status === 'active' || row.status === 'in_progress' ? 'bg-green-100 text-green-700' :
                    row.status === 'completed' || row.status === 'invoiced' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{row.status.replace('_',' ')}</span>
                </td>
                <td className="px-3 py-3 text-gray-500 text-xs">{row.type}</td>
                <td className="px-3 py-3 text-gray-700">{row.summary.estimatedHours.toFixed(1)}</td>
                <td className="px-3 py-3 font-medium text-gray-900">{row.summary.actualHours.toFixed(1)}</td>
                <td className="px-3 py-3 text-gray-600">{formatCurrency(row.summary.estimatedCost)}</td>
                <td className="px-3 py-3 font-semibold text-gray-900">{formatCurrency(row.summary.actualCost)}</td>
                <td className="px-3 py-3 text-blue-600">{formatCurrency(row.summary.projectedCost)}</td>
                <td className="px-3 py-3">{varianceBadge(row.summary.variance)}</td>
                <td className={`px-3 py-3 font-semibold ${row.summary.margin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                  {formatPercent(row.summary.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {allRows.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="card text-center">
            <p className="text-xs text-gray-500 mb-1">Total Actual Hours</p>
            <p className="text-xl font-bold text-gray-900">{allRows.reduce((s,r) => s + r.summary.actualHours, 0).toFixed(1)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500 mb-1">Total Actual Cost</p>
            <p className="text-xl font-bold text-red-500">{formatCurrency(allRows.reduce((s,r) => s + r.summary.actualCost, 0))}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500 mb-1">Avg Margin</p>
            <p className="text-xl font-bold text-[#27AE60]">
              {formatPercent(allRows.filter(r => r.summary.margin > 0).reduce((s,r,_,a) => s + r.summary.margin / a.length, 0))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Crew Productivity ────────────────────────────────────────────────────────
function CrewProductivityReport({ data }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(now.getFullYear());

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const YEARS  = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const monthEntries = data.timeEntries.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const byEmployee = data.employees.map(emp => {
    const entries = monthEntries.filter(t => t.employeeId === emp.id);
    const totalHours = entries.reduce((s, t) => s + t.hours, 0);
    const jobs = [...new Set(entries.map(t => t.jobName))];
    const laborCost = totalHours * emp.hourlyRate;
    const workDays = data.settings.defaultWorkingDaysPerMonth;
    return { emp, totalHours, jobs, laborCost, avgHoursPerDay: workDays > 0 ? totalHours / workDays : 0 };
  }).filter(r => r.totalHours > 0 || true); // show all employees

  const totalHoursAll = byEmployee.reduce((s, r) => s + r.totalHours, 0);
  const totalCostAll  = byEmployee.reduce((s, r) => s + r.laborCost, 0);

  return (
    <div>
      <div className="flex gap-3 mb-6">
        <select className="input max-w-[180px]" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select className="input max-w-[100px]" value={year} onChange={e => setYear(Number(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Hours Logged</p>
          <p className="text-2xl font-bold text-gray-900">{totalHoursAll.toFixed(1)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Labor Cost</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalCostAll)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Active Crew Members</p>
          <p className="text-2xl font-bold text-gray-900">{byEmployee.filter(r => r.totalHours > 0).length}</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Employee','Role','Total Hours','Avg Hrs/Day','Labor Cost','Jobs Worked'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byEmployee.map(({ emp, totalHours, jobs, laborCost, avgHoursPerDay }) => (
              <tr key={emp.id} className={`hover:bg-gray-50 ${totalHours === 0 ? 'opacity-40' : ''}`}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{emp.name}</p>
                  {emp.isOwner && <span className="text-xs text-[#27AE60] font-medium">Owner</span>}
                </td>
                <td className="px-4 py-3 text-gray-500">{emp.role}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{totalHours.toFixed(1)}</td>
                <td className="px-4 py-3 text-gray-700">{avgHoursPerDay.toFixed(1)}</td>
                <td className="px-4 py-3 text-amber-600 font-medium">{formatCurrency(laborCost)}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{jobs.length > 0 ? jobs.slice(0, 3).join(', ') + (jobs.length > 3 ? ` +${jobs.length - 3}` : '') : '—'}</td>
              </tr>
            ))}
          </tbody>
          {totalHoursAll > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold text-sm">
                <td colSpan={2} className="px-4 py-2 text-gray-600">Total</td>
                <td className="px-4 py-2 text-gray-900">{totalHoursAll.toFixed(1)}</td>
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2 text-amber-600">{formatCurrency(totalCostAll)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Hours bar chart */}
      {totalHoursAll > 0 && (
        <div className="card mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Hours Distribution</h3>
          <div className="space-y-3">
            {byEmployee.filter(r => r.totalHours > 0).map(({ emp, totalHours }) => (
              <div key={emp.id} className="flex items-center gap-3">
                <p className="text-sm text-gray-700 w-32 shrink-0 truncate">{emp.name.split(' ')[0]}</p>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#27AE60] rounded-full" style={{ width: `${(totalHours / totalHoursAll) * 100}%` }} />
                </div>
                <p className="text-sm text-gray-700 w-20 text-right">{totalHours.toFixed(1)} hrs</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Revenue Forecast ─────────────────────────────────────────────────────────
function RevenueForecastReport({ data }: Props) {
  const now = new Date();
  const activeContracts = data.contracts.filter(c => c.status === 'active' && contractHasActiveJob(data, c.id));
  const monthlyContractRevenue = activeContracts.reduce((s, c) => s + c.monthlyRevenue, 0);
  const annualContractRevenue  = activeContracts.reduce((s, c) => s + c.annualRevenue, 0);
  const outstandingInvoices    = calcOutstandingInvoices(data);

  // Pipeline value — won + estimate_sent leads
  const pipelineValue = data.leads
    .filter(l => l.stage === 'won' || l.stage === 'estimate_sent')
    .reduce((s, l) => s + l.estimatedValue, 0);

  // Snow forecast: avg trips per month × avg trip revenue
  const { plowingRatePerHour, shovelingRatePerHour, deicingRatePerBag } = data.settings;
  const snowRevenue = data.snowTrips.reduce((s, t) =>
    s + (t.plowingHours * plowingRatePerHour)
      + (t.shovelingHours * shovelingRatePerHour)
      + (t.deicingBags * deicingRatePerBag), 0);
  const snowMonths  = data.snowTrips.length > 0
    ? new Set(data.snowTrips.map(t => t.serviceDate.slice(0, 7))).size
    : 0;
  const avgSnowPerMonth = snowMonths > 0 ? snowRevenue / snowMonths : 0;

  // Next 3 months
  const forecast = [0, 1, 2].map(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return {
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
      contracts: monthlyContractRevenue,
      snow: avgSnowPerMonth,
      total: monthlyContractRevenue + avgSnowPerMonth,
    };
  });

  const maxForecast = Math.max(...forecast.map(f => f.total), 1);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Monthly Recurring</p>
          <p className="text-2xl font-bold text-[#27AE60]">{formatCurrency(monthlyContractRevenue)}</p>
          <p className="text-xs text-gray-400 mt-1">{activeContracts.length} active contracts</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Annual Recurring</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(annualContractRevenue)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Outstanding Invoices</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(outstandingInvoices)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Open Pipeline</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(pipelineValue)}</p>
        </div>
      </div>

      {/* 3-month forecast */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Next 3 Months Forecast</h3>
        <div className="space-y-4">
          {forecast.map(f => (
            <div key={f.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-800">{f.label}</span>
                <span className="font-bold text-gray-900">{formatCurrency(f.total)}</span>
              </div>
              <div className="h-8 bg-gray-100 rounded-lg overflow-hidden flex">
                <div
                  className="h-full bg-[#27AE60]"
                  style={{ width: `${(f.contracts / maxForecast) * 100}%` }}
                  title={`Contracts: ${formatCurrency(f.contracts)}`}
                />
                {f.snow > 0 && (
                  <div
                    className="h-full bg-blue-400"
                    style={{ width: `${(f.snow / maxForecast) * 100}%` }}
                    title={`Snow avg: ${formatCurrency(f.snow)}`}
                  />
                )}
              </div>
              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#27AE60] inline-block" /> Contracts {formatCurrency(f.contracts)}</span>
                {f.snow > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Snow avg {formatCurrency(f.snow)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active contracts table */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Active Contracts</h3>
        <div className="space-y-2">
          {activeContracts.length === 0 ? (
            <p className="text-sm text-gray-400">No active contracts</p>
          ) : activeContracts.map(c => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-gray-800">{c.clientName}</span>
              <div className="text-right">
                <span className="font-semibold text-gray-900">{formatCurrency(c.monthlyRevenue)}/mo</span>
                <span className="text-gray-400 ml-2 text-xs">{formatCurrency(c.annualRevenue)}/yr</span>
              </div>
            </div>
          ))}
        </div>
        {activeContracts.length > 0 && (
          <div className="flex justify-between text-sm font-bold mt-3 pt-3 border-t">
            <span>Total</span>
            <span>{formatCurrency(monthlyContractRevenue)}/mo · {formatCurrency(annualContractRevenue)}/yr</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Accounting Codes Report ──────────────────────────────────────────────────
function AccountingCodesReport({ data }: Props) {
  const [filterJob, setFilterJob] = useState('all');

  // Build a map of accountingCode.id → { code, name, budgeted, actual } across all jobs
  // Labor codes (01-xxx): come from TimeEntry.costCodeId
  // Other codes (02-05): come from resource items linked to jobs via costCode field
  //   and from ExpenseEntry.costCodeId

  const activejobs = data.jobs.filter(j => j.status === 'active' || j.status === 'completed');
  const jobsToShow = filterJob === 'all' ? activejobs : activejobs.filter(j => j.id === filterJob);

  // Collect all accounting codes with spending data
  interface CodeRow {
    codeId: string;
    code: string;
    name: string;
    budgeted: number;   // sum of job costCode budgeted for mapped category
    actual: number;     // sum of TimeEntries + Expenses tagged to this code
    jobs: string[];     // job numbers this appears on
  }

  const codeMap = new Map<string, CodeRow>();

  function getOrCreate(ac: { id: string; code: string; name: string }): CodeRow {
    if (!codeMap.has(ac.id)) {
      codeMap.set(ac.id, { codeId: ac.id, code: ac.code, name: ac.name, budgeted: 0, actual: 0, jobs: [] });
    }
    return codeMap.get(ac.id)!;
  }

  // 1. Time entries → labor codes (01-xxx)
  data.timeEntries.forEach(te => {
    if (!te.costCodeId) return;
    const ac = data.accountingCodes.find(a => a.id === te.costCodeId);
    if (!ac) return;
    const job = data.jobs.find(j => j.id === te.jobId);
    if (filterJob !== 'all' && (!job || job.id !== filterJob)) return;
    const row = getOrCreate(ac);
    const emp = data.employees.find(e => e.id === te.employeeId);
    row.actual += te.hours * (emp?.hourlyRate ?? data.settings.laborRatePerHour);
    if (job && !row.jobs.includes(job.jobNumber)) row.jobs.push(job.jobNumber);
  });

  // 2. Expenses → any cost code
  data.expenses.filter(e => e.status === 'approved').forEach(exp => {
    if (!exp.costCodeId) return;
    const ac = data.accountingCodes.find(a => a.id === exp.costCodeId);
    if (!ac) return;
    const job = data.jobs.find(j => j.id === exp.jobId);
    if (filterJob !== 'all' && (!job || job.id !== filterJob)) return;
    const row = getOrCreate(ac);
    row.actual += exp.amount;
    if (job && !row.jobs.includes(job.jobNumber)) row.jobs.push(job.jobNumber);
  });

  // 3. Job costCodes → budgeted amounts, mapped to accounting codes via category
  //    Labor (01) → category: labor
  //    Materials/Supplies (02) → category: materials
  //    Subcontractor (03) → category: subcontractor
  //    Equipment (04) → category: equipment
  //    Other/Overhead (05) → category: other
  // For budgeted, spread each job's cost code budgeted amount across all codes in that category
  const categoryToPrefix: Record<string, string> = {
    labor: '01', materials: '02', subcontractor: '03', equipment: '04', other: '05',
  };

  jobsToShow.forEach(job => {
    job.costCodes.forEach(cc => {
      const prefix = categoryToPrefix[cc.category];
      if (!prefix) return;
      const codesInCategory = data.accountingCodes.filter(a => a.code.startsWith(prefix + '-'));
      if (codesInCategory.length === 0) return;
      const perCode = cc.budgeted / codesInCategory.length;
      codesInCategory.forEach(ac => {
        const row = getOrCreate(ac);
        row.budgeted += perCode;
        if (!row.jobs.includes(job.jobNumber)) row.jobs.push(job.jobNumber);
      });
    });
  });

  const rows = [...codeMap.values()].sort((a, b) => a.code.localeCompare(b.code));
  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual   = rows.reduce((s, r) => s + r.actual, 0);

  // Group by prefix for display sections
  const prefixLabels: Record<string, string> = {
    '01': '01 — Labor',
    '02': '02 — Materials / Field Supplies',
    '03': '03 — Subcontractors',
    '04': '04 — Equipment',
    '05': '05 — Overhead / Other',
  };
  const grouped = new Map<string, CodeRow[]>();
  rows.forEach(r => {
    const prefix = r.code.split('-')[0];
    if (!grouped.has(prefix)) grouped.set(prefix, []);
    grouped.get(prefix)!.push(r);
  });

  // Also show codes with no entries yet (from accountingCodes list)
  const allCodes = data.accountingCodes;
  const unseenCodes = allCodes.filter(ac => !codeMap.has(ac.id));
  unseenCodes.forEach(ac => {
    const prefix = ac.code.split('-')[0];
    if (!grouped.has(prefix)) grouped.set(prefix, []);
    // Only show if not already there
    if (!grouped.get(prefix)!.find(r => r.codeId === ac.id)) {
      grouped.get(prefix)!.push({ codeId: ac.id, code: ac.code, name: ac.name, budgeted: 0, actual: 0, jobs: [] });
    }
  });

  return (
    <div className="space-y-5">
      {/* Filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <select className="input max-w-xs" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="all">All Jobs</option>
          {data.jobs.filter(j => j.status !== 'archived').map(j => <option key={j.id} value={j.id}>{j.jobNumber} · {j.clientName}</option>)}
        </select>
        <div className="ml-auto flex gap-4 text-sm">
          <span className="text-gray-500">Total Budgeted: <strong className="text-gray-800">{formatCurrency(totalBudgeted)}</strong></span>
          <span className="text-gray-500">Total Actual: <strong className={totalActual > totalBudgeted ? 'text-red-600' : 'text-amber-700'}>{formatCurrency(totalActual)}</strong></span>
        </div>
      </div>

      {data.accountingCodes.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="text-sm">No accounting codes set up yet.</p>
          <p className="text-xs mt-1">Add codes in <strong>Resources → Accounting Codes</strong>.</p>
        </div>
      ) : (
        [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([prefix, codeRows]) => {
          const groupBudgeted = codeRows.reduce((s, r) => s + r.budgeted, 0);
          const groupActual   = codeRows.reduce((s, r) => s + r.actual, 0);
          const groupOver     = groupActual > groupBudgeted && groupBudgeted > 0;

          return (
            <div key={prefix} className="card p-0 overflow-hidden">
              {/* Group header */}
              <div className={`px-4 py-3 flex items-center justify-between ${groupOver ? 'bg-red-50' : 'bg-gray-50'} border-b border-gray-200`}>
                <h3 className="text-sm font-bold text-gray-700">{prefixLabels[prefix] ?? `${prefix} — Other`}</h3>
                <div className="flex gap-6 text-xs">
                  <span className="text-gray-500">Budgeted: <strong className="text-gray-800">{formatCurrency(groupBudgeted)}</strong></span>
                  <span className="text-gray-500">Actual: <strong className={groupOver ? 'text-red-600' : 'text-amber-700'}>{formatCurrency(groupActual)}</strong></span>
                  {groupBudgeted > 0 && (
                    <span className={`font-semibold ${groupOver ? 'text-red-600' : 'text-green-600'}`}>
                      {groupOver ? '▲' : '▼'} {formatCurrency(Math.abs(groupActual - groupBudgeted))} {groupOver ? 'over' : 'under'}
                    </span>
                  )}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 w-24">Code</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Name</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 w-28">Budgeted</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 w-28">Actual</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 w-28">Variance</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400">Jobs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {codeRows.sort((a, b) => a.code.localeCompare(b.code)).map(r => {
                    const variance = r.budgeted - r.actual;
                    const over = r.actual > r.budgeted && r.budgeted > 0;
                    const pctUsed = r.budgeted > 0 ? Math.min((r.actual / r.budgeted) * 100, 100) : 0;
                    return (
                      <tr key={r.codeId} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-gray-500">{r.code}</td>
                        <td className="px-4 py-2.5 text-gray-800 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {r.budgeted > 0 ? formatCurrency(r.budgeted) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.actual > 0 ? (
                            <div>
                              <span className={`font-semibold ${over ? 'text-red-600' : 'text-amber-700'}`}>{formatCurrency(r.actual)}</span>
                              {r.budgeted > 0 && (
                                <div className="w-20 bg-gray-100 rounded-full h-1 mt-1 ml-auto">
                                  <div className={`h-1 rounded-full ${over ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pctUsed}%` }} />
                                </div>
                              )}
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-semibold">
                          {r.budgeted > 0 ? (
                            <span className={variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {r.jobs.length > 0 ? r.jobs.slice(0, 4).join(', ') + (r.jobs.length > 4 ? ` +${r.jobs.length - 4}` : '') : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Main Reports Page ────────────────────────────────────────────────────────
export default function Reports({ data }: Props) {
  const [tab, setTab] = useState<ReportTab>('pnl');

  const TABS: { key: ReportTab; label: string; desc: string }[] = [
    { key: 'pnl',        label: 'Monthly P&L',       desc: 'Revenue, costs, net profit by month' },
    { key: 'jobcosting', label: 'Job Costing',        desc: 'Est vs actual vs projected per job' },
    { key: 'crew',       label: 'Crew Productivity',  desc: 'Hours & cost by employee' },
    { key: 'forecast',   label: 'Revenue Forecast',   desc: 'Next 3 months + pipeline' },
    { key: 'codes',      label: 'Accounting Codes',   desc: 'Spending by code across all jobs' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Reports"
        subtitle="Financial metrics, job costing, productivity, and revenue forecasting"
      />

      {/* Report selector */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${
              tab === t.key
                ? 'border-[#27AE60] bg-green-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className={`font-semibold text-sm ${tab === t.key ? 'text-[#27AE60]' : 'text-gray-900'}`}>{t.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
          </button>
        ))}
      </div>

      {/* Report content */}
      <div>
        {tab === 'pnl'        && <PnLReport               data={data} />}
        {tab === 'jobcosting' && <JobCostingReport         data={data} />}
        {tab === 'crew'       && <CrewProductivityReport   data={data} />}
        {tab === 'forecast'   && <RevenueForecastReport    data={data} />}
        {tab === 'codes'      && <AccountingCodesReport    data={data} />}
      </div>
    </div>
  );
}
