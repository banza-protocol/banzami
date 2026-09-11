'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Copy } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type AdminProof, type ProofVerification } from '@/lib/admin-api';
import { Card, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate, formatDateTime } from '@/lib/format';
import { useAdminEnv, type Env } from '@/lib/admin-env';
import { EnvToggle } from '@/components/layout/env-toggle';
import { confirmedTitle, operationRows, proofStatusLabel } from '@/lib/proof-view';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}


const STATUS: Record<string, string> = {
  CONFIRMED: 'bg-green-50 text-green-700',
  PENDING: 'bg-amber-50 text-amber-700',
  REVERSED: 'bg-red-50 text-red-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

export default function ProofsPage() {
  const toast = useToast();
  const [proofs, setProofs] = useState<AdminProof[] | null>(null);
  const [error, setError] = useState('');
  const { env, setEnv, liveAvailable } = useAdminEnv();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ proof: AdminProof; verifications: ProofVerification[] } | null>(null);

  const load = useCallback(async (q: string, e: Env) => {
    const api = getApi();
    if (!api) return;
    setProofs(null); setError('');
    try {
      const r = await api.listProofs(q || undefined, e === 'SANDBOX' ? 'SANDBOX' : undefined);
      setProofs(r.proofs ?? []);
    } catch {
      setError('Não foi possível carregar os comprovativos.');
      setProofs([]);
    }
  }, []);

  useEffect(() => { const t = setTimeout(() => void load(search, env), 250); return () => clearTimeout(t); }, [load, search, env]);

  async function open(p: AdminProof) {
    const api = getApi();
    if (!api) return;
    try { setSelected(await api.getProof(p.proof_reference, env === 'SANDBOX' ? 'SANDBOX' : undefined)); }
    catch { toast('danger', 'Não foi possível carregar o detalhe.'); }
  }

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); toast('success', 'URL pública copiada.'); } catch { /* ignore */ }
  }

  return (
    <div className="p-[26px]">
      <div className="mb-[22px] flex items-center justify-between border-b border-[#f1e3e3]">
        <h1 className="flex items-center gap-2 pb-[14px] text-[26px] font-extrabold text-[#1a1a1a]"><ShieldCheck size={24} className="text-[#B5101F]" /> Comprovativos</h1>
        <div className="mb-3"><EnvToggle env={env} setEnv={setEnv} liveAvailable={liveAvailable} /></div>
      </div>
      <p className="mb-4 text-[14px] text-[#9a8a8e]">Verificação pública de comprovativos (ADR-040) — apenas leitura. Os comprovativos são imutáveis e nunca são editados ou apagados aqui.</p>

      <div className="mb-[18px]">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar por referência (BZM-…) ou transaction id" className="w-full max-w-[420px] rounded-full border border-[#eaddde] px-4 py-2 text-sm font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]" />
      </div>

      <Card>
        {error ? <ErrorState message={error} /> : proofs === null ? (
          <div className="px-6 py-[60px] text-center text-[15px] text-[#9a8a8e]">A carregar…</div>
        ) : proofs.length === 0 ? (
          <EmptyMsg title="Nenhum comprovativo encontrado." hint="Os comprovativos são gerados quando um recibo é emitido." />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {proofs.map((p) => (
              <button key={p.proof_reference} onClick={() => open(p)} className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-gray-100 px-4 py-3 text-left transition hover:border-[#B5101F]/40 hover:bg-[#FFF7F6]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="font-mono font-bold text-[#9A1B22]">{p.proof_reference}</span>
                    <span className="rounded bg-[#f3e9e9] px-1.5 py-0.5 text-[10px] font-bold text-[#7a6a6e]">{p.environment}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-500">
                    {p.payer_display_name || p.payer_handle || '—'} → {p.payee_display_name || p.payee_handle || '—'} · {p.verification_count} verificaç{p.verification_count === 1 ? 'ão' : 'ões'} · {formatDate(p.issued_at)}
                  </div>
                </div>
                <span className="text-sm font-extrabold text-[#2a2024]">{formatMoney(p.amount_minor, p.currency)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[p.status] ?? 'bg-gray-100 text-gray-500'}`}>{proofStatusLabel(p.status)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div className="flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-white p-6 shadow-[0_0_80px_-20px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="font-mono text-[18px] font-black text-[#9A1B22]">{selected.proof.proof_reference}</div>
                {selected.proof.status === 'CONFIRMED' && (
                  <div className="mt-1 text-[14px] font-extrabold text-[#166534]">{confirmedTitle(selected.proof.operation_kind)}</div>
                )}
                <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[selected.proof.status] ?? 'bg-gray-100 text-gray-500'}`}>{proofStatusLabel(selected.proof.status)}</span>
              </div>
              <button onClick={() => copy(selected.proof.public_url)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#eaddde] px-3 py-1.5 text-[13px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6]"><Copy size={14} /> Copiar URL pública</button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#f1e3e3] pt-4 text-[13.5px]">
              {[
                ['Valor', formatMoney(selected.proof.amount_minor, selected.proof.currency)],
                ['Moeda', selected.proof.currency],
                ['De', selected.proof.payer_display_name || selected.proof.payer_handle],
                ['Para', selected.proof.payee_display_name || selected.proof.payee_handle],
                ...operationRows(selected.proof),
                ['Transaction id', selected.proof.transaction_id],
                ['Confirmado', selected.proof.confirmed_at ? formatDateTime(selected.proof.confirmed_at) : '—'],
                ['Emitido', formatDateTime(selected.proof.issued_at)],
                ['Hash', selected.proof.proof_hash?.slice(0, 24)],
                ['Assinatura', `${selected.proof.signature_algorithm ?? ''} · ${selected.proof.signature_key_id ?? ''}`],
                ['Verificações', String(selected.proof.verification_count)],
                ['URL pública', selected.proof.public_url],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a8a8e]">{k}</span>
                  <span className="break-all font-semibold text-[#2a2024]">{v || '—'}</span>
                </div>
              ))}
            </div>
            <h3 className="mb-2 mt-5 text-[12px] font-extrabold uppercase tracking-wide text-[#7a6a6e]">Histórico de verificações</h3>
            {selected.verifications.length === 0 ? (
              <p className="text-[13px] font-semibold text-[#9a8a8e]">Ainda sem verificações públicas.</p>
            ) : (
              <ul className="space-y-1.5">
                {selected.verifications.map((v, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-[12.5px]">
                    <span className="font-semibold text-[#2a2024]">{formatDateTime(v.verified_at)}</span>
                    <span className="font-bold text-green-700">{v.result}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
