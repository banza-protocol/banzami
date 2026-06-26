'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApi, isStorageNotConfigured, type KybDocument } from '@/lib/admin-api';

// "Documentos KYB" section for a Business application detail view (Track 3).
// Self-contained: pass an authenticated AdminApi + the application id. When the
// gateway reports storage isn't provisioned it shows a clear notice instead of
// failing. Signed read URLs are opened directly and never rendered as text.

const TYPE_LABEL: Record<string, string> = {
  BUSINESS_REGISTRATION: 'Certidão Comercial',
  TAX_ID: 'NIF da Empresa',
  REPRESENTATIVE_ID: 'BI do Representante',
  PROOF_OF_ADDRESS: 'Comprovativo de Morada',
  BANK_PROOF: 'Comprovativo Bancário',
  OTHER: 'Outro',
};

const STATUS_STYLE: Record<string, string> = {
  UPLOADED: 'bg-amber-50 text-amber-700',
  ACCEPTED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
  PENDING_UPLOAD: 'bg-gray-100 text-gray-500',
};

function fmtSize(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KybDocumentsSection({
  api,
  applicationId,
  reviewedBy,
}: {
  api: AdminApi;
  applicationId: string;
  reviewedBy: string;
}) {
  const [docs, setDocs] = useState<KybDocument[] | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.listApplicationDocuments(applicationId);
      setDocs(r.data);
      setNotConfigured(false);
    } catch (e) {
      if (isStorageNotConfigured(e)) {
        setNotConfigured(true);
        setDocs([]);
      } else {
        setError('Não foi possível carregar os documentos.');
      }
    }
  }, [api, applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDocument(documentId: string) {
    setBusy(documentId);
    try {
      const { read_url } = await api.createDocumentReadURL(applicationId, documentId);
      window.open(read_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(isStorageNotConfigured(e) ? 'Armazenamento KYB ainda não configurado.' : 'Não foi possível abrir o documento.');
    } finally {
      setBusy(null);
    }
  }

  async function accept(documentId: string) {
    setBusy(documentId);
    try {
      await api.acceptDocument(applicationId, documentId, reviewedBy);
      await load();
    } catch {
      setError('Não foi possível aceitar o documento.');
    } finally {
      setBusy(null);
    }
  }

  async function reject(documentId: string) {
    const reason = window.prompt('Motivo da rejeição (visível para a equipa):');
    if (!reason || !reason.trim()) return;
    setBusy(documentId);
    try {
      await api.rejectDocument(applicationId, documentId, reason.trim(), reviewedBy);
      await load();
    } catch {
      setError('Não foi possível rejeitar o documento.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="m-0 text-base font-bold text-gray-900">Documentos KYB</h2>

      {notConfigured ? (
        <p className="mt-3 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-500">
          Armazenamento KYB ainda não configurado.
        </p>
      ) : docs === null ? (
        <p className="mt-3 text-sm text-gray-400">A carregar…</p>
      ) : docs.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">Nenhum documento enviado.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {docs.map((d) => (
            <div key={d.document_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900">{TYPE_LABEL[d.document_type] ?? d.document_type}</div>
                <div className="truncate text-xs text-gray-400">
                  {d.original_filename} · {fmtSize(d.size_bytes)}
                  {d.rejection_reason ? ` · Motivo: ${d.rejection_reason}` : ''}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {d.status}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy === d.document_id || d.status === 'PENDING_UPLOAD'}
                  onClick={() => openDocument(d.document_id)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Ver / Descarregar
                </button>
                <button
                  type="button"
                  disabled={busy === d.document_id || d.status === 'PENDING_UPLOAD'}
                  onClick={() => accept(d.document_id)}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                >
                  Aceitar
                </button>
                <button
                  type="button"
                  disabled={busy === d.document_id || d.status === 'PENDING_UPLOAD'}
                  onClick={() => reject(d.document_id)}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
