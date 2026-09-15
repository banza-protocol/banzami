import Link from 'next/link';
import type { ActivityItem } from '@/lib/consumer-api';
import { formatKz } from '@/lib/money';
import { shortDateTime } from '@/lib/format';

// One activity line — matches the native semantics: direction sets the sign and
// colour, the counterparty (or funding label) is the title, the note is the
// subtitle. A transfer links to its receipt.
export function ActivityRow({ item }: { item: ActivityItem }) {
  const incoming = item.direction === 'INCOMING';
  const title =
    item.counterparty_display_name ||
    (item.counterparty_handle ? `@${item.counterparty_handle}` : item.item_type === 'WALLET_FUNDED' ? 'Carregamento de teste' : 'Movimento');
  const sign = incoming ? '+' : '−';
  const body = (
    <div className="flex items-center gap-3 px-1 py-3">
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${incoming ? 'bg-emerald-50' : 'bg-cream-100'}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {incoming
            ? <path d="M12 5v14M6 13l6 6 6-6" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            : <path d="M12 19V5M6 11l6-6 6 6" stroke="#9A1B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-ink">{title}</div>
        <div className="truncate text-[12.5px] font-medium text-ink-muted">
          {item.note ? item.note : shortDateTime(item.created_at)}
        </div>
      </div>
      <div className={`flex-none text-[15px] font-black ${incoming ? 'text-emerald-600' : 'text-ink'}`}>
        {sign}{formatKz(item.amount_minor)}
      </div>
    </div>
  );
  if (item.transfer_id) {
    return <Link href={`/historico/${item.transfer_id}`} className="block no-underline transition active:bg-black/[0.02]">{body}</Link>;
  }
  return <div>{body}</div>;
}
