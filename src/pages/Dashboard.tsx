import { useNavigate } from 'react-router-dom';
import type { AppData } from '../types';
import MetricCard from '../components/MetricCard';
import {
  calcMonthlyRevenue,
  calcTotalMonthlyCost,
  calcAnnualRevenue,
  calcSnowSeasonRevenue,
  calcOutstandingInvoices,
  calcCollectedRevenue,
  contractHasActiveJob,
  formatCurrency,
  formatPercent,
} from '../utils/calculations';

interface Props { data: AppData }

export default function Dashboard({ data }: Props) {
  const navigate = useNavigate();
  const monthlyRevenue  = calcMonthlyRevenue(data);
  const monthlyCost     = calcTotalMonthlyCost(data);
  const monthlyProfit   = monthlyRevenue - monthlyCost;
  const marginPct       = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
  const annualRevenue   = calcAnnualRevenue(data);
  const snowRevenue     = calcSnowSeasonRevenue(data);
  const outstanding     = calcOutstandingInvoices(data);
  const collected       = calcCollectedRevenue(data);
  const activeContracts = data.contracts.filter(c => c.status === 'active' && contractHasActiveJob(data, c.id));

  const overdueInvoices = data.invoices.filter(i => i.status === 'overdue');
  const pendingInvoices = data.invoices.filter(i => i.status === 'sent');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/estimator')}>
          + New Estimate
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Monthly Revenue"
          value={formatCurrency(monthlyRevenue)}
          sub={`${activeContracts.length} active contracts`}
          color="green"
          icon="$"
        />
        <MetricCard
          title="Monthly Cost"
          value={formatCurrency(monthlyCost)}
          sub="All expenses"
          color="yellow"
          icon="↑"
        />
        <MetricCard
          title="Monthly Profit"
          value={formatCurrency(monthlyProfit)}
          sub={monthlyProfit >= 0 ? 'Profitable' : 'Deficit'}
          color={monthlyProfit >= 0 ? 'green' : 'red'}
          icon={monthlyProfit >= 0 ? '▲' : '▼'}
        />
        <MetricCard
          title="Gross Margin"
          value={formatPercent(marginPct)}
          sub={`Target: ${data.settings.targetMargin}%`}
          color={marginPct >= data.settings.targetMargin ? 'green' : marginPct > 0 ? 'yellow' : 'red'}
          icon="%"
        />
      </div>

      {/* Financial Tracking Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Outstanding"
          value={formatCurrency(outstanding)}
          sub={`${pendingInvoices.length} sent invoice${pendingInvoices.length !== 1 ? 's' : ''}`}
          color={outstanding > 0 ? 'blue' : 'gray'}
          icon="📄"
        />
        <MetricCard
          title="Overdue"
          value={formatCurrency(overdueInvoices.reduce((s,i) => s + i.total, 0))}
          sub={`${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''} past due`}
          color={overdueInvoices.length > 0 ? 'red' : 'gray'}
          icon="⚠"
        />
        <MetricCard
          title="Collected YTD"
          value={formatCurrency(collected)}
          sub="Payments received"
          color="green"
          icon="✓"
        />
        <MetricCard
          title="Snow Revenue"
          value={formatCurrency(snowRevenue)}
          sub={`${data.snowTrips.length} trip${data.snowTrips.length !== 1 ? 's' : ''} this season`}
          color={snowRevenue > 0 ? 'blue' : 'gray'}
          icon="❄"
        />
      </div>

      {/* Active Contracts + Cost Breakdown */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Active Contracts</h2>
          {activeContracts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No active contracts yet</p>
          ) : (
            <div className="space-y-3">
              {activeContracts.map(c => {
                const margin = c.grossMargin ?? (c.monthlyRevenue > 0
                  ? ((c.monthlyRevenue - c.totalCost) / c.monthlyRevenue * 100)
                  : 0);
                return (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{c.clientName}</p>
                      <p className="text-xs text-gray-500">#{c.estimateNumber} · {c.propertyType} · {c.lineItems.length} services</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#27AE60]">{formatCurrency(c.monthlyRevenue)}<span className="text-gray-400 font-normal">/mo</span></p>
                      <p className={`text-xs ${margin >= data.settings.targetMargin ? 'text-green-600' : 'text-yellow-600'}`}>
                        {formatPercent(margin)} margin
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="mt-4 text-sm text-[#27AE60] hover:underline font-medium" onClick={() => navigate('/contracts')}>
            View all contracts →
          </button>
        </div>

        {/* Cost Breakdown */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Monthly Cost Breakdown</h2>
          {[
            { label: 'Labor', value: data.employees.reduce((s, e) => s + e.hourlyRate * e.hoursPerWeek * 4.33, 0), color: 'bg-blue-400' },
            { label: 'Overhead & Software', value: data.overhead.reduce((s, o) => s + o.monthlyCost, 0), color: 'bg-purple-400' },
            { label: 'Equipment Depreciation', value: data.equipment.reduce((s, e) => s + e.monthlyDepreciation, 0), color: 'bg-yellow-400' },
            { label: 'Field Supplies & Fuel', value: data.fieldSupplies.reduce((s, f) => s + f.unitCost * f.monthlyUsage, 0), color: 'bg-orange-400' },
          ].map(item => (
            <div key={item.label} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{item.label}</span>
                <span className="font-medium">{formatCurrency(item.value)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${item.color} rounded-full`}
                  style={{ width: `${monthlyCost > 0 ? Math.min((item.value / monthlyCost) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatCurrency(monthlyCost)}</span>
          </div>
        </div>
      </div>

      {/* Invoices + Annual Outlook */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Recent invoices */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Invoices</h2>
          {data.invoices.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No invoices yet</p>
          ) : (
            <div className="space-y-2">
              {[...data.invoices]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 5)
                .map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <p className="font-semibold text-gray-900">{inv.clientName}</p>
                      <p className="text-xs text-gray-400">{inv.invoiceNumber} · Due {inv.dueDate || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{formatCurrency(inv.total)}</p>
                      <span className={
                        inv.status === 'paid'    ? 'badge-green' :
                        inv.status === 'overdue' ? 'badge-red'   :
                        inv.status === 'sent'    ? 'badge-yellow':
                        'badge-gray'
                      }>{inv.status}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
          <button className="mt-4 text-sm text-[#27AE60] hover:underline font-medium" onClick={() => navigate('/invoices')}>
            View all invoices →
          </button>
        </div>

        {/* Annual outlook */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Annual Outlook</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Maintenance Contracts</span>
              <span className="font-semibold text-gray-900">{formatCurrency(annualRevenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Snow Removal (YTD)</span>
              <span className="font-semibold text-blue-600">{formatCurrency(snowRevenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Revenue</span>
              <span className="font-bold text-[#27AE60]">{formatCurrency(annualRevenue + snowRevenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Annual Cost (est.)</span>
              <span className="font-semibold text-amber-600">{formatCurrency(monthlyCost * 12)}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm font-bold text-gray-700">Annual Net Profit</span>
              <span className={`text-lg font-bold ${(annualRevenue + snowRevenue) - (monthlyCost * 12) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency((annualRevenue + snowRevenue) - (monthlyCost * 12))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Breakeven callout */}
      {monthlyRevenue > 0 && (
        <div className={`rounded-xl p-4 border ${
          monthlyProfit >= 0
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <p className="text-sm font-semibold">
            {monthlyProfit >= 0
              ? `✓ You are ${formatCurrency(monthlyProfit)}/month profitable at a ${formatPercent(marginPct)} margin.`
              : `⚠ You need ${formatCurrency(Math.abs(monthlyProfit))} more revenue per month to break even.`
            }
          </p>
          {marginPct < data.settings.targetMargin && monthlyProfit >= 0 && (
            <p className="text-xs mt-1 opacity-80">
              Your target margin is {data.settings.targetMargin}%. Close{' '}
              {formatCurrency((monthlyCost / (1 - data.settings.targetMargin / 100)) - monthlyRevenue)} more in monthly contracts to hit it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
