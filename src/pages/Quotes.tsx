import { useNavigate } from 'react-router-dom';
import type { AppData, ContractStatus } from '../types';
import { saveData } from '../utils/storage';
import { formatCurrency } from '../utils/calculations';

interface Props { data: AppData; setData: (d: AppData) => void }

// Quote-stage statuses (not yet active jobs)
const QUOTE_STATUSES: ContractStatus[] = ['estimate', 'draft', 'awaiting_response', 'changes_requested', 'approved'];

const STATUS_LABEL: Record<string, string> = {
  estimate:          'Draft',
  draft:             'Draft',
  awaiting_response: 'Awaiting response',
  changes_requested: 'Changes requested',
  approved:          'Approved',
  active:            'Active',
  closed:            'Closed',
  lost:              'Lost',
};

const STATUS_COLOR: Record<string, string> = {
  estimate:          'bg-gray-100 text-gray-600',
  draft:             'bg-gray-100 text-gray-600',
  awaiting_response: 'bg-yellow-100 text-yellow-700',
  changes_requested: 'bg-orange-100 text-orange-700',
  approved:          'bg-green-100 text-green-700',
};

export default function Quotes({ data, setData }: Props) {
  const navigate = useNavigate();

  const quotes = data.contracts.filter(c => QUOTE_STATUSES.includes(c.status));
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentQuotes = quotes.filter(q => new Date(q.createdAt) >= thirtyDaysAgo);
  const sent = quotes.filter(q => q.status === 'awaiting_response');
  const approved = quotes.filter(q => q.status === 'approved');
  const draft = quotes.filter(q => q.status === 'draft' || q.status === 'estimate');
  const changesRequested = quotes.filter(q => q.status === 'changes_requested');

  const conversionRate = recentQuotes.length > 0
    ? Math.round((approved.filter(q => new Date(q.createdAt) >= thirtyDaysAgo).length / recentQuotes.length) * 100)
    : 0;

  const sentValue = sent.reduce((s, q) => s + (q.annualRevenue || q.subtotalRevenue || 0), 0);

  function markActive(id: string) {
    const updated = {
      ...data,
      contracts: data.contracts.map(c => c.id === id ? { ...c, status: 'active' as ContractStatus } : c),
    };
    setData(updated);
    saveData(updated);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
        <button onClick={() => navigate('/quotes/new')} className="btn-primary px-5 py-2">New Quote</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Overview */}
        <div className="card col-span-2">
          <p className="font-semibold text-gray-800 mb-3">Overview</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-gray-600">Draft</span>
              <span className="ml-auto font-semibold">{draft.length}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-gray-600">Awaiting response</span>
              <span className="ml-auto font-semibold">{sent.length}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-gray-600">Changes requested</span>
              <span className="ml-auto font-semibold">{changesRequested.length}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-600">Approved</span>
              <span className="ml-auto font-semibold">{approved.length}</span>
            </div>
          </div>
        </div>

        {/* Conversion rate */}
        <div className="card">
          <p className="font-semibold text-gray-800 mb-1">Conversion rate</p>
          <p className="text-xs text-gray-400 mb-3">Past 30 days</p>
          <span className="text-4xl font-bold text-gray-900">{conversionRate}%</span>
        </div>

        {/* Sent */}
        <div className="card">
          <p className="font-semibold text-gray-800 mb-1">Sent</p>
          <p className="text-xs text-gray-400 mb-3">Awaiting response</p>
          <span className="text-4xl font-bold text-gray-900">{sent.length}</span>
          {sentValue > 0 && <p className="text-xs text-green-600 mt-1">{formatCurrency(sentValue)}</p>}
        </div>

        {/* Approved */}
        <div className="card">
          <p className="font-semibold text-gray-800 mb-1">Approved</p>
          <p className="text-xs text-gray-400 mb-3">Ready to activate</p>
          <span className="text-4xl font-bold text-[#27AE60]">{approved.length}</span>
        </div>
      </div>

      {/* Quotes table */}
      <div className="card p-0">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="font-semibold text-gray-800">All quotes <span className="text-gray-400 font-normal">({quotes.length} results)</span></p>
        </div>

        {quotes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📄</p>
            <p className="font-medium">No quotes yet</p>
            <p className="text-sm mt-1 mb-4">Convert a request or click "New Quote" to get started</p>
            <button onClick={() => navigate('/quotes/new')} className="btn-primary">New Quote</button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Quote number</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Property</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Created</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {quotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(q => {
                const annualTotal = q.annualRevenue || q.subtotalRevenue || 0;
                return (
                  <tr
                    key={q.id}
                    onClick={() => navigate(`/quotes/${q.id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900 text-sm">{q.clientName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-gray-400">#{q.estimateNumber}</p>
                      {(q.title) && <p className="text-sm text-gray-700 mt-0.5">{q.title}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {[q.address, q.city, q.state, q.zip].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[q.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[q.status] ?? q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 text-sm">
                      {formatCurrency(annualTotal)}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {q.status === 'approved' && (
                        <button
                          onClick={() => markActive(q.id)}
                          className="text-xs text-[#27AE60] hover:underline font-semibold"
                          title="Activate job"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
