'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type KycCaseSummary } from '@/lib/admin-api';
import { Card, EmptyMsg, ErrorState } from '@/components/ui/table';
import { KycReviewDrawer } from '@/components/consumer-kyc/review-drawer';
import { KYC_STATUS, KYC_DOC_LABEL } from '@/components/consumer-kyc/labels';
import { formatDate } from '@/lib/format';
import { useAdminEnv, type Env } from '@/lib/admin-env';
import { EnvToggle } from '@/components/layout/env-toggle';
import { AttentionChip } from '@/components/ui/attention-chip';
import { useAttentionCategory } from '@/components/layout/attention-provider';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi() : null;
}


// "Requer atenção" (first chip) is the state the server counts for the badge.
const CHIPS: { label: string; value: string }[] = [
  { label: 'Aguarda documentos', value: 'WAITING_DOCUMENTS' },
  { label: 'Aprovado', value: 'APPROVED' },
  { label: 'Rejeitado', value: 'REJECTED' },
  { label: 'Todos', value: '' },
];

export default function ConsumerKycPage() {
  const [cases, setCases] = useState<KycCaseSummary[] | null>(null);
  const [error, setError] = useState('');
  const { states: attentionStates } = useAttentionCategory('kyc_documents');
  const attentionStatus = attentionStates?.length === 1 ? attentionStates[0] : 'UNDER_REVIEW';
  const [status, setStatus] = useState('UNDER_REVIEW');
  const { env, setEnv, liveAvailable } = useAdminEnv();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<KycCaseSummary | null>(null);

  const load = useCallback(async (s: string, e: Env) => {
    const api = getApi();
    if (!api) return;
    setCases(null);
    setError('');
    try {
      const r = await api.listKycCases(s || undefined, e === 'SANDBOX' ? 'SANDBOX' : undefined, 200);
      setCases(r.cases ?? []);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === 'UNAVAILABLE'
          ? `A revisão de KYC em ${e === 'LIVE' ? 'Produção' : 'Sandbox'} não está disponível neste ambiente.`
          : 'Não foi possível carregar os casos KYC.',
      );
      setCases([]);
    }
  }, []);

  useEffect(() => { void load(status, env); }, [load, status, env]);

  const q = search.trim().toLowerCase();
  const shown = (cases ?? []).filter((c) =>
    !q ||
    (c.consumer_name ?? '').toLowerCase().includes(q) ||
    (c.consumer_handle ?? '').toLowerCase().includes(q) ||
    c.subject_id.toLowerCase().includes(q) ||
    (c.consumer_phone ?? '').toLowerCase().includes(q) ||
    (c.document_type ?? '').toLowerCase().includes(q),
  );

  const api = getApi();

  return (
    <div className="p-[26px]">
      <div className="mb-[22px] flex items-center justify-between border-b border-[#f1e3e3]">
        <h1 className="pb-[14px] text-[26px] font-extrabold text-[#1a1a1a]">Documentos KYC</h1>
        <div className="mb-3">
          <EnvToggle env={env} setEnv={setEnv} liveAvailable={liveAvailable} />
        </div>
      </div>
      <p className="mb-4 text-[14px] text-[#9a8a8e]">
        Verificação de identidade de consumidores (KYC). O operador decide o nível concedido — nunca o consumidor.
        {env === 'SANDBOX' && <span className="font-bold text-amber-700"> A rever casos de SANDBOX.</span>}
      </p>

      <div className="mb-[18px] flex flex-wrap items-center gap-2">
        <AttentionChip
          attentionKey="kyc_documents"
          active={status === attentionStatus}
          onToggle={() => setStatus(attentionStatus)}
          className="rounded-full px-4 py-2 text-sm font-bold"
          activeClass="bg-[#1a1a1a] text-white"
          idleClass="border border-[#eaddde] text-[#5a4a4e]"
        />
        {CHIPS.map((c) => (
          <button
            key={c.value || 'all'}
            onClick={() => setStatus(c.value)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${status === c.value ? 'bg-[#1a1a1a] text-white' : 'border border-[#eaddde] text-[#5a4a4e]'}`}
          >
            {c.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar por nome, @handle, id ou telefone"
          className="ml-auto rounded-full border border-[#eaddde] px-4 py-2 text-sm font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]"
        />
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} />
        ) : cases === null ? (
          <div className="px-6 py-[60px] text-center text-[15px] text-[#9a8a8e]">A carregar…</div>
        ) : shown.length === 0 ? (
          <EmptyMsg
            title="Nenhum caso KYC encontrado neste ambiente."
            hint={`A rever ${env === 'LIVE' ? 'Produção' : 'Sandbox'}. Confirme o ambiente no seletor Live/Sandbox acima.`}
          />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {shown.map((c) => {
              const st = KYC_STATUS[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-500' };
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`flex w-full flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-left transition hover:border-[#B5101F]/40 hover:bg-[#FFF7F6] ${c.consumer_exists ? 'border-gray-100' : 'border-amber-300 bg-amber-50/40'}`}
                >
                  <ScanFace size={18} className="text-[#B5101F]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className="font-bold text-gray-800">{c.consumer_exists ? (c.consumer_name || 'Consumidor') : 'Consumidor removido'}</span>
                      {c.consumer_handle && <span className="font-mono text-xs text-[#7a6a6e]">@{c.consumer_handle}</span>}
                      <span className="rounded-md bg-[#f3e9e9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#7a6a6e]">{c.environment}</span>
                      {!c.consumer_exists && <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">Consumidor inexistente / órfão</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                      {KYC_DOC_LABEL[c.document_type ?? ''] ?? c.document_type ?? 'Documento'}
                      {c.document_country ? ` · ${c.document_country}` : ''}
                      {` · ${c.evidence_count} evidência${c.evidence_count === 1 ? '' : 's'}`}
                      {c.kyc_level ? ` · Nível ${c.kyc_level}` : ''}
                      <span className="font-mono text-gray-400"> · {c.subject_id.slice(0, 8)}…</span>
                    </div>
                    <div className="truncate text-xs text-gray-400">
                      {c.submitted_at ? `Submetido: ${formatDate(c.submitted_at)}` : `Criado: ${formatDate(c.created_at)}`}
                      {c.reviewed_at ? ` · Revisto: ${formatDate(c.reviewed_at)}` : ''}
                      {c.reason_code ? ` · Motivo: ${c.reason_code}` : ''}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  <span className="rounded-lg border border-[#eaddde] px-3 py-1.5 text-sm font-semibold text-[#5a4a4e]">Rever</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selected && api && (
        <KycReviewDrawer
          api={api}
          summary={selected}
          env={env}
          onClose={() => setSelected(null)}
          onDecided={() => { setSelected(null); void load(status, env); }}
        />
      )}
    </div>
  );
}
