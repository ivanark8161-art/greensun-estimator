interface MetricCardProps {
  title: string;
  value: string;
  sub?: string;
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'gray';
  icon?: string;
}

const COLOR_MAP = {
  green:  { bg: 'bg-green-50',  border: 'border-green-200', icon: 'bg-green-100 text-green-700', text: 'text-green-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',  icon: 'bg-blue-100 text-blue-700',   text: 'text-blue-700' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200',icon: 'bg-yellow-100 text-yellow-700',text: 'text-yellow-700' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',   icon: 'bg-red-100 text-red-700',     text: 'text-red-700' },
  gray:   { bg: 'bg-gray-50',   border: 'border-gray-200',  icon: 'bg-gray-100 text-gray-600',   text: 'text-gray-600' },
};

export default function MetricCard({ title, value, sub, color = 'green', icon }: MetricCardProps) {
  const c = COLOR_MAP[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          <p className={`mt-1 text-2xl font-bold ${c.text}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${c.icon}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
