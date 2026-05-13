import { Spinner } from './spinner';

interface Props {
  label:    string;
  value:    string;
  sub?:     string;
  loading?: boolean;
}

export function StatCard({ label, value, sub, loading }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-card p-xl flex flex-col gap-xs">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      {loading ? (
        <Spinner className="h-7 w-7 mt-xs" />
      ) : (
        <>
          <p className="text-3xl font-bold text-gray-900 font-mono tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </>
      )}
    </div>
  );
}
