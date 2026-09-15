import Link from 'next/link';
import { readSession } from '@/lib/session';
import { getActivity } from '@/lib/consumer-api';
import { formatKz } from '@/lib/money';
import { shortDateTime } from '@/lib/format';
import { SandboxBadge } from '@/components/SandboxBadge';

export const dynamic = 'force-dynamic';

// Receipt — the canonical consumer detail for a movement. Built from the activity
// record so it shows the counterparty as a @banza and name, never an internal id,
// wallet, posting or account (§55).
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await readSession())!;
  const a = await getActivity(s.token);
  const item = (a.ok ? a.data.items ?? [] : []).find((it) => it.transfer_id === id || it.activity_id === id);

  if (!item) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-[15px] font-medium text-ink-soft">Comprovativo não encontrado.</p>
        <Link href="/historico" className="mt-3 inline-block text-[14px] font-bold text-cherry">Voltar ao histórico</Link>
      </div>
    );
  }

  const incoming = item.direction === 'INCOMING';
  const who = item.counterparty_display_name || (item.counterparty_handle ? `@${item.counterparty_handle}` : 'Carregamento de teste');
  return (
    <div className="px-5 pb-8 pt-4">
      <div className="flex items-center gap-3">
        <Link href="/historico" aria-label="Voltar" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-black/5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        <h1 className="text-[19px] font-black text-ink">Comprovativo</h1>
      </div>

      <div className="mt-5 rounded-3xl bg-white p-6 text-center shadow-[0_16px_40px_-28px_rgba(0,0,0,.4)]">
        <div className="text-[13px] font-semibold text-ink-muted">{incoming ? 'Recebido de' : 'Enviado para'}</div>
        <div className="mt-0.5 text-[17px] font-black text-ink">{who}</div>
        {item.counterparty_handle && <div className="text-[13px] font-medium text-cherry">@{item.counterparty_handle}</div>}
        <div className={`mt-4 text-[34px] font-black tracking-[-0.02em] ${incoming ? 'text-emerald-600' : 'text-ink'}`}>{incoming ? '+' : '−'}{formatKz(item.amount_minor)}</div>
        <div className="mt-4 flex flex-col gap-2 border-t border-[#f3ecec] pt-4 text-left text-[13.5px]">
          <Row k="Estado" v={item.status === 'COMPLETED' ? 'Concluído' : item.status} />
          <Row k="Data" v={shortDateTime(item.completed_at || item.created_at)} />
          {item.note && <Row k="Nota" v={item.note} />}
          <Row k="Referência" v={(item.transfer_id ?? item.activity_id).slice(0, 8)} mono />
        </div>
      </div>
      <div className="mt-4 flex justify-center"><SandboxBadge /></div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-ink-muted">{k}</span>
      <span className={`font-bold text-ink ${mono ? 'font-mono text-[12.5px]' : ''}`}>{v}</span>
    </div>
  );
}
