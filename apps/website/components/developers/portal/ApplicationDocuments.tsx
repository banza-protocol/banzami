'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listApplicationDocuments,
  uploadKybDocument,
  type ApplicationDocument,
  type KybDocumentType,
} from '@/lib/api';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_SLOTS,
  STORAGE_NOT_CONFIGURED_TEXT,
  documentLabel,
  documentProblem,
} from '@/lib/financial-onboarding';
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, SECONDARY_BUTTON } from './ui';

/**
 * The documents of a Project's Business application — what is attached, and a
 * way to attach what is still due.
 *
 * Documents go straight to the Gateway's public document endpoints by
 * application reference, exactly as the public Business application uploads
 * them (lib/api.ts uploadKybDocument): the Console adds no second path. A
 * deployment without document storage answers 503 STORAGE_NOT_CONFIGURED, and
 * that is said as it is — the upload is never shown as done when it was not.
 */

const STATUS_TEXT: Record<string, string> = {
  UPLOADED: 'Enviado · a aguardar verificação',
  ACCEPTED: 'Aceite',
  REJECTED: 'Recusado',
  PENDING_UPLOAD: 'Envio não concluído',
};

type SlotState =
  | { k: 'idle' }
  | { k: 'invalid'; message: string }
  | { k: 'uploading' }
  | { k: 'done' }
  | { k: 'error'; message: string };

export function ApplicationDocuments({
  applicationId,
  uploadable,
  canUpload,
  onUploaded,
}: {
  applicationId: string;
  /** Which document types may be sent from here. */
  uploadable: KybDocumentType[];
  /** OWNER/ADMIN. Everyone else sees the list only. */
  canUpload: boolean;
  onUploaded?: () => void;
}) {
  const [docs, setDocs] = useState<ApplicationDocument[] | null | 'loading'>('loading');
  const [files, setFiles] = useState<Partial<Record<KybDocumentType, File>>>({});
  const [slots, setSlots] = useState<Partial<Record<KybDocumentType, SlotState>>>({});
  const [storageOff, setStorageOff] = useState(false);

  const load = useCallback(async () => {
    setDocs(await listApplicationDocuments(applicationId));
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  function pick(type: KybDocumentType, file: File | undefined) {
    if (!file) return;
    const problem = documentProblem(file);
    if (problem) {
      setFiles((f) => ({ ...f, [type]: undefined }));
      setSlots((s) => ({ ...s, [type]: { k: 'invalid', message: problem } }));
      return;
    }
    setFiles((f) => ({ ...f, [type]: file }));
    setSlots((s) => ({ ...s, [type]: { k: 'idle' } }));
  }

  async function send(type: KybDocumentType) {
    const file = files[type];
    if (!file) {
      setSlots((s) => ({ ...s, [type]: { k: 'invalid', message: 'Escolha primeiro o ficheiro.' } }));
      return;
    }
    setSlots((s) => ({ ...s, [type]: { k: 'uploading' } }));
    let res;
    try {
      res = await uploadKybDocument(applicationId, type, file);
    } catch {
      res = { ok: false as const, reason: 'ERROR' as const, message: 'Sem ligação ao serviço. Tente novamente.' };
    }
    if (res.ok) {
      setSlots((s) => ({ ...s, [type]: { k: 'done' } }));
      setFiles((f) => ({ ...f, [type]: undefined }));
      void load();
      onUploaded?.();
      return;
    }
    if (res.reason === 'NOT_CONFIGURED') {
      setStorageOff(true);
      setSlots((s) => ({ ...s, [type]: { k: 'idle' } }));
      return;
    }
    setSlots((s) => ({ ...s, [type]: { k: 'error', message: res.message } }));
  }

  const slotDefs = DOCUMENT_SLOTS.filter((d) => uploadable.includes(d.type));

  return (
    <div data-testid="application-documents" style={{ marginTop: 18 }}>
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900 }}>Documentos</h3>

      {docs === 'loading' && (
        <p style={FIELD_HINT}>A carregar os documentos…</p>
      )}
      {docs === null && (
        <p style={FIELD_HINT}>Não foi possível ler os documentos agora. Isto não significa que faltem — tente mais tarde.</p>
      )}
      {Array.isArray(docs) && docs.length === 0 && (
        <p style={FIELD_HINT}>Ainda não foi enviado nenhum documento.</p>
      )}
      {Array.isArray(docs) && docs.length > 0 && (
        <ul aria-label="Documentos enviados" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
          {docs.map((d) => (
            <li
              key={d.document_id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #F3EDEC', fontSize: 13.5 }}
            >
              <span style={{ fontWeight: 700, color: '#2a2024' }}>
                {documentLabel(d.document_type)}
                <span style={{ display: 'block', fontSize: 12, color: '#8a7a7e', fontWeight: 600 }}>{d.original_filename}</span>
              </span>
              <span style={{ fontWeight: 800, color: d.status === 'REJECTED' ? '#B5101F' : '#2a2024', textAlign: 'right' }}>
                {STATUS_TEXT[d.status] ?? d.status}
                {d.status === 'REJECTED' && d.rejection_reason ? `: ${d.rejection_reason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {storageOff && (
        <p role="alert" style={{ ...FIELD_ERROR, marginTop: 12 }}>
          {STORAGE_NOT_CONFIGURED_TEXT} Nenhum documento foi enviado.
        </p>
      )}

      {canUpload && slotDefs.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          {slotDefs.map((d) => {
            const id = `fo-doc-upload-${d.type.toLowerCase()}`;
            const st = slots[d.type] ?? { k: 'idle' };
            return (
              <div key={d.type}>
                <label htmlFor={id} style={FIELD_LABEL}>{d.label}</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    id={id}
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    aria-describedby={`${id}-hint`}
                    onChange={(e) => pick(d.type, e.target.files?.[0])}
                    style={{ fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => void send(d.type)}
                    disabled={st.k === 'uploading'}
                    style={SECONDARY_BUTTON}
                  >
                    {st.k === 'uploading' ? 'A enviar…' : `Enviar ${d.label}`}
                  </button>
                </div>
                <p id={`${id}-hint`} style={FIELD_HINT}>{d.hint} · PDF, JPEG ou PNG, até 5 MB.</p>
                {(st.k === 'invalid' || st.k === 'error') && <p role="alert" style={FIELD_ERROR}>{st.message}</p>}
                {st.k === 'done' && <p role="status" style={{ ...FIELD_HINT, color: '#1F8A5B', fontWeight: 800 }}>Documento enviado.</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
