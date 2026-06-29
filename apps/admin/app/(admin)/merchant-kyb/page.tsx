'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type MerchantKybSummary } from '@/lib/admin-api';
import { Card, EmptyMsg, ErrorState } from '@/components/ui/table';
import { MerchantKybDrawer } from '@/components/merchant-kyb/review-drawer';
import { formatDate } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

type Env = 'LIVE' | 'SANDBOX';

// Entity-level badge derived from the document aggregates — describes the whole
// merchant's KYB state, not a single document.
function merchantBadge(m: MerchantKybSummary): { label: string; cls: string } {
  if (!m.merchant_exists) return { label: 'Órfão', cls: 'bg-amber-200 text-amber-900' };
  if (m.pending > 0) return { label: 'Pronto para revisão', cls: 'bg-amber-50 text-amber-700' };
  if (m.kyb_status === 'APPROVED' || (m.approved > 0 && m.rejected === 0 && m.expired === 0)) return { label: 'Aprovado', cls: 'bg-green-50 text-green-700' };
  if (m.rejected > 0) return { label: 'Rejeitado', cls: 'bg-red-50 text-red-700' };
  if (m.expired > 0) return { label: 'Expirado', cls: 'bg-red-50 text-red-700' };
  if (m.total < 3) return { label: 'Incompleto', cls: 'bg-gray-100 text-gray-600' };
  return { label: m.kyb_status || '—', cls: 'bg-gray-100 text-gray-500' };
}

export default function MerchantKybPage() {
  const [merchants, setMerchants] = useState<MerchantKybSummary[] | null>(null);
  const [error, setError] = useState('');
  const [env, setEnv] = useState<Env>('LIVE');
  const [search, setSearch] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);
  const [selected, setSelected] = useState<MerchantKybSummary | null>(null);

  const load = useCallback(async (e: Env) => {
    const api = getApi();
    if (!api) return;
    setMerchants(null);
    setError('');
    try {
      const r = await api.listMerchantKybMerchants(e === 'SANDBOX' ? 'SANDBOX' : undefined, 200);
      setMerchants(r.merchants ?? []);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === 'UNAVAILABLE' || code === 'NOT_FOUND'
          ? `A revisão de comerciantes KYB em ${e === 'LIVE' ? 'Produção' : 'Sandbox'} não está disponível.`
          : 'Não foi possível carregar os comerciantes.',
      );
      setMerchants([]);
    }
  }, []);

  useEffect(() => { void load(env); }, [load, env]);

  const q = search.trim().toLowerCase();
  const shown = (merchants ?? []).filter((m) =>
    (!onlyPending || m.pending > 0) &&
    (!q ||
      (m.name ?? '').toLowerCase().includes(q) ||
      (m.handle ?? '').toLowerCase().includes(q) ||
      m.merchant_id.toLowerCase().includes(q) ||
      (m.contact ?? '').toLowerCase().includes(q)),
  );

  const api = getApi();

  return (
    <div className="p-[26px]">
      <div className="mb-[22px] flex items-center justify-between border-b border-[#f1e3e3]">
        <h1 className="pb-[14px] text-[26px] font-extrabold text-[#1a1a1a]">Documentos KYB</h1>
        <div className="mb-3 flex items-center gap-3">
          <span className={`rounded-md px-3 py-1.5 text-sm font-extrabold uppercase tracking-wide ${env === 'LIVE' ? 'bg-[#B5101F] text-white' : 'bg-amber-500 text-white'}`}>
            {env === 'LIVE' ? '● Produção (LIVE)' : '● Sandbox'}
          </span>
          <div className="flex overflow-hidden rounded-lg border border-[#eaddde]">
            {(['LIVE', 'SANDBOX'] as Env[]).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                className={`px-3 py-1.5 text-sm font-bold ${env === e ? (e === 'LIVE' ? 'bg-[#B5101F] text-white' : 'bg-amber-500 text-white') : 'bg-white text-[#5a4a4e]'}`}
              >
                {e === 'LIVE' ? 'Live' : 'Sandbox'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mb-4 text-[14px] text-[#9a8a8e]">
        Revisão por comerciante — abra um comerciante para ver a candidatura, todos os documentos e o histórico.
        {env === 'SANDBOX' && <span className="font-bold text-amber-700"> A rever comerciantes de SANDBOX.</span>}
      </p>

      <div className="mb-[18px] flex flex-wrap items-center gap-2">
        {[{ label: 'Pendentes de revisão', value: true }, { label: 'Todos', value: false }].map((c) => (
          <button
            key={String(c.value)}
            onClick={() => setOnlyPending(c.value)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${onlyPending === c.value ? 'bg-[#1a1a1a] text-white' : 'border border-[#eaddde] text-[#5a4a4e]'}`}
          >
            {c.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar por nome, @handle, id ou contacto"
          className="ml-auto rounded-full border border-[#eaddde] px-4 py-2 text-sm font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]"
        />
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} />
        ) : merchants === null ? (
          <div className="px-6 py-[60px] text-center text-[15px] text-[#9a8a8e]">A carregar…</div>
        ) : shown.length === 0 ? (
          <EmptyMsg
            title="Nenhum comerciante encontrado neste ambiente."
            hint={`A rever ${env === 'LIVE' ? 'Produção' : 'Sandbox'}. ${onlyPending ? 'Mostrando apenas pendentes — desligue o filtro para ver todos.' : 'Confirme o ambiente no seletor Live/Sandbox.'}`}
          />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {shown.map((m) => {
              const badge = merchantBadge(m);
              return (
                <button
                  key={m.merchant_id}
                  onClick={() => setSelected(m)}
                  className={`flex w-full flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-left transition hover:border-[#B5101F]/40 hover:bg-[#FFF7F6] ${m.merchant_exists ? 'border-gray-100' : 'border-amber-300 bg-amber-50/40'}`}
                >
                  <Building2 size={18} className="text-[#B5101F]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className="font-bold text-gray-800">{m.merchant_exists ? (m.name || 'Comerciante') : 'Comerciante removido'}</span>
                      {m.handle && <span className="font-mono text-xs text-[#7a6a6e]">@{m.handle}</span>}
                      {m.environment && <span className="rounded-md bg-[#f3e9e9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#7a6a6e]">{m.environment}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                      {m.status ? `${m.status}` : ''}
                      {m.kyb_status ? ` · KYB ${m.kyb_status}` : ''}
                      {m.country ? ` · ${m.country}` : ''}
                      {m.contact ? ` · ${m.contact}` : ''}
                      <span className="font-mono text-gray-400"> · {m.merchant_id.slice(0, 8)}…</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{m.total} doc{m.total === 1 ? '' : 's'}</span>
                      {m.pending > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{m.pending} pendente{m.pending === 1 ? '' : 's'}</span>}
                      {m.approved > 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">{m.approved} aprovado{m.approved === 1 ? '' : 's'}</span>}
                      {m.rejected > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">{m.rejected} rejeitado{m.rejected === 1 ? '' : 's'}</span>}
                      {m.expired > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{m.expired} expirado{m.expired === 1 ? '' : 's'}</span>}
                      {m.last_submission && <span className="text-gray-400">· última submissão {formatDate(m.last_submission)}</span>}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>{badge.label}</span>
                  <span className="rounded-lg border border-[#eaddde] px-3 py-1.5 text-sm font-semibold text-[#5a4a4e]">Rever</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selected && api && (
        <MerchantKybDrawer
          api={api}
          merchant={selected}
          env={env}
          onClose={() => setSelected(null)}
          onChanged={() => { void load(env); }}
        />
      )}
    </div>
  );
}
