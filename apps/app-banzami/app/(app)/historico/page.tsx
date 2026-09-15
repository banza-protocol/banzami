import { readSession } from '@/lib/session';
import { getActivity } from '@/lib/consumer-api';
import { ActivityRow } from '@/components/ActivityRow';

export const dynamic = 'force-dynamic';

// History — the same underlying Consumer activity as native (§54). One list, one
// ordering (newest first, as the backend returns it).
export default async function Historico() {
  const s = (await readSession())!;
  const a = await getActivity(s.token);
  const items = a.ok ? a.data.items ?? [] : [];
  return (
    <div className="px-5 pb-6 pt-4">
      <h1 className="text-[20px] font-black text-ink">Histórico</h1>
      <div className="mt-3 rounded-2xl bg-white px-3 shadow-[0_10px_30px_-24px_rgba(0,0,0,.4)]">
        {items.length === 0 ? (
          <p className="px-2 py-10 text-center text-[13.5px] font-medium text-ink-muted">Ainda sem movimentos.</p>
        ) : (
          <div className="divide-y divide-[#f3ecec]">{items.map((it) => <ActivityRow key={it.activity_id} item={it} />)}</div>
        )}
      </div>
    </div>
  );
}
