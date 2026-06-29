'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type MerchantKybDoc } from '@/lib/admin-api';
import { Card, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/components/ui/dialog';
import { formatDate } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

// The KYB review environment is operator-selectable: LIVE reads the live gateway,
// SANDBOX forwards (via admin-api) to the staging gateway. The selected environment
// is shown as a strong badge so live and sandbox data are never confused.
type Env = 'LIVE' | 'SANDBOX';

const TYPE_LABEL: Record<string, string> = {
  COMMERCIAL_REGISTRATION: 'Registo Comercial',
  COMPANY_TAX_ID: 'NIF da empresa',
  REPRESENTATIVE_ID: 'Documento do representante',
};

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_REVIEW: { label: 'Em análise', cls: 'bg-amber-50 text-amber-700' },
  VALID: { label: 'Válido', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'Rejeitado', cls: 'bg-red-50 text-red-700' },
  EXPIRED: { label: 'Expirado', cls: 'bg-red-50 text-red-700' },
  REPLACED: { label: 'Substituído', cls: 'bg-gray-100 text-gray-500' },
};

const CHIPS: { label: string; value: string }[] = [
  { label: 'Em análise', value: 'PENDING_REVIEW' },
  { label: 'Válido', value: 'VALID' },
  { label: 'Rejeitado', value: 'REJECTED' },
  { label: 'Expirado', value: 'EXPIRED' },
  { label: 'Substituído', value: 'REPLACED' },
  { label: 'Todos', value: '' },
];

export default function MerchantKybPage() {
  const toast = useToast();
  const dialog = useDialog();
  const [docs, setDocs] = useState<MerchantKybDoc[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [env, setEnv] = useState<Env>('LIVE');
  const [busy, setBusy] = useState<string | null>(null);

  const envParam = (e: Env) => (e === 'SANDBOX' ? 'SANDBOX' : undefined);

  const load = useCallback(async (s: string, e: Env) => {
    const api = getApi();
    if (!api) return;
    setDocs(null);
    setError('');
    try {
      const r = await api.listMerchantKybDocuments(s || undefined, 200, e === 'SANDBOX' ? 'SANDBOX' : undefined);
      setDocs(r.documents ?? []);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === 'UNAVAILABLE' || code === 'NOT_FOUND'
          ? `A revisão de documentos KYB em ${e === 'LIVE' ? 'Produção' : 'Sandbox'} não está disponível.`
          : 'Não foi possível carregar os documentos.',
      );
      setDocs([]);
    }
  }, []);

  useEffect(() => { void load(status, env); }, [load, status, env]);

  function openDocument(d: MerchantKybDoc) {
    // download_url is a short-TTL signed GET minted server-side; never logged.
    if (!d.download_url) {
      toast('warning', 'Documento indisponível para abrir.');
      return;
    }
    window.open(d.download_url, '_blank', 'noopener,noreferrer');
  }

  async function approve(d: MerchantKybDoc) {
    const vu = await dialog.prompt({
      title: 'Aprovar documento',
      label: 'Validade (opcional) — AAAA-MM-DD',
      placeholder: 'ex.: 2027-12-31',
      confirmLabel: 'Aprovar',
      required: false,
    });
    if (vu === null) return; // cancelled
    let validUntil: string | undefined;
    const t = vu.trim();
    if (t) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) { toast('warning', 'Data inválida. Use AAAA-MM-DD.'); return; }
      validUntil = `${t}T00:00:00Z`;
    }
    const a = getApi();
    if (!a) return;
    setBusy(d.id);
    try {
      await a.approveMerchantKybDocument(d.id, validUntil, envParam(env));
      toast('success', 'Documento aprovado.');
      await load(status, env);
    } catch {
      setError('Não foi possível aprovar o documento.');
    } finally { setBusy(null); }
  }

  async function reject(d: MerchantKybDoc) {
    const reason = await dialog.prompt({
      title: 'Rejeitar documento',
      label: 'Motivo da rejeição (visível para o comerciante)',
      multiline: true,
      confirmLabel: 'Rejeitar',
      required: true,
    });
    if (!reason || !reason.trim()) return;
    const a = getApi();
    if (!a) return;
    setBusy(d.id);
    try {
      await a.rejectMerchantKybDocument(d.id, reason.trim(), envParam(env));
      toast('success', 'Documento rejeitado.');
      await load(status, env);
    } catch {
      setError('Não foi possível rejeitar o documento.');
    } finally { setBusy(null); }
  }

  return (
    <div className="p-[26px]">
      <div className="mb-[22px] flex items-center justify-between border-b border-[#f1e3e3]">
        <h1 className="pb-[14px] text-[26px] font-extrabold text-[#1a1a1a]">Documentos KYB</h1>
        <div className="mb-3 flex items-center gap-3">
          {/* Strong, unmissable environment badge — so live and sandbox data are never confused. */}
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
        Documentos do negócio enviados/atualizados dentro da app Business (pós-aprovação) — distintos dos documentos da candidatura.
        {env === 'SANDBOX' && <span className="font-bold text-amber-700"> A rever documentos de SANDBOX.</span>}
      </p>

      <div className="mb-[18px] flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.value || 'all'}
            onClick={() => setStatus(c.value)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${status === c.value ? 'bg-[#1a1a1a] text-white' : 'border border-[#eaddde] text-[#5a4a4e]'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} />
        ) : docs === null ? (
          <div className="px-6 py-[60px] text-center text-[15px] text-[#9a8a8e]">A carregar…</div>
        ) : docs.length === 0 ? (
          <EmptyMsg
            title="Nenhum documento encontrado neste ambiente."
            hint={`A rever ${env === 'LIVE' ? 'Produção' : 'Sandbox'}. Confirme se a app usada está no mesmo ambiente (use o seletor Live/Sandbox acima).`}
          />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {docs.map((d) => {
              const st = STATUS[d.status] ?? { label: d.status, cls: 'bg-gray-100 text-gray-500' };
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 px-4 py-3">
                  <FileText size={18} className="text-[#B5101F]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">{TYPE_LABEL[d.document_type] ?? d.document_type}</div>
                    <div className="truncate text-xs text-gray-400">
                      Comerciante: {d.merchant_id.slice(0, 8)}…
                      {d.submitted_at ? ` · Enviado: ${formatDate(d.submitted_at)}` : ''}
                      {d.valid_until ? ` · Validade: ${formatDate(d.valid_until)}` : ''}
                      {d.reviewed_at ? ` · Revisto: ${formatDate(d.reviewed_at)}` : ''}
                      {d.rejection_reason ? ` · Motivo: ${d.rejection_reason}` : ''}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  {d.download_url && (
                    <button onClick={() => openDocument(d)} className="rounded-lg border border-[#eaddde] px-3 py-1.5 text-sm font-semibold text-[#5a4a4e]">
                      Ver
                    </button>
                  )}
                  {d.status === 'PENDING_REVIEW' && (
                    <>
                      <button disabled={busy === d.id} onClick={() => approve(d)} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
                        Aprovar
                      </button>
                      <button disabled={busy === d.id} onClick={() => reject(d)} className="rounded-lg bg-[#B5101F] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
                        Rejeitar
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
