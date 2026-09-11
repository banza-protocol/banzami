'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { uploadKybDocument, type KybDocumentType } from '@/lib/api';
import {
  STATUS_COPY,
  documentsToSend,
  fetchApplicationStatus,
  isApplicationReference,
  resubmitApplication,
  type ApplicationStatus,
  type RequirementIssue,
} from '@/lib/application-status';

const RED = '#B5101F';
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 5 * 1024 * 1024;

type DocState = { status: 'idle' | 'uploading' | 'done' | 'error'; message?: string };

/**
 * The applicant's page for one application, reached from the confirmation
 * screen or the email Banzami sends with a request for information.
 */
export function ApplicationStatusView() {
  const params = useSearchParams();
  const [ref, setRef] = useState(params.get('ref') ?? '');
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, DocState>>({});
  const [storageOff, setStorageOff] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (r: string) => {
    setProblem(null);
    const res = await fetchApplicationStatus(r);
    if (res.ok) {
      setStatus(res.status);
    } else {
      setStatus(null);
      setProblem(
        res.reason === 'NOT_FOUND'
          ? 'Não encontrámos uma candidatura com esta referência.'
          : 'Não foi possível consultar a candidatura agora. Tente novamente.',
      );
    }
  }, []);

  useEffect(() => {
    if (ref) void load(ref);
  }, [ref, load]);

  async function send(item: RequirementIssue, file: File | undefined) {
    if (!file || !status) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      setDocs((d) => ({ ...d, [item.code]: { status: 'error', message: 'Formato inválido — use PDF, JPG ou PNG.' } }));
      return;
    }
    if (file.size > MAX_BYTES) {
      setDocs((d) => ({ ...d, [item.code]: { status: 'error', message: 'Ficheiro demasiado grande — máximo 5 MB.' } }));
      return;
    }
    setDocs((d) => ({ ...d, [item.code]: { status: 'uploading' } }));
    const r = await uploadKybDocument(status.application_id, item.code as KybDocumentType, file);
    if (r.ok) {
      setDocs((d) => ({ ...d, [item.code]: { status: 'done' } }));
      await load(status.application_id);
    } else if (r.reason === 'NOT_CONFIGURED') {
      setStorageOff(true);
      setDocs((d) => ({ ...d, [item.code]: { status: 'error', message: 'O envio de documentos ainda não está disponível.' } }));
    } else {
      setDocs((d) => ({ ...d, [item.code]: { status: 'error', message: r.message } }));
    }
  }

  async function resubmit() {
    if (!status) return;
    setResubmitting(true);
    setNotice(null);
    const r = await resubmitApplication(status.application_id);
    setResubmitting(false);
    if (r.ok) {
      setStatus(r.status);
      setNotice('Candidatura reenviada para análise.');
    } else {
      setNotice(r.message);
    }
  }

  if (!ref) {
    return (
      <Card>
        <h1 className="m-0 text-[24px] font-black">Estado da candidatura</h1>
        <p className="mb-5 mt-2 text-[15px] font-semibold text-[#6a5a5e]">
          Introduza a referência completa que apareceu no ecrã quando submeteu a candidatura.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isApplicationReference(typed)) setRef(typed.trim());
            else setProblem('A referência não tem o formato certo.');
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="ref" className="text-[13px] font-extrabold text-[#6a5a5e]">Referência da candidatura</label>
          <input
            id="ref"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-white px-4 py-3 font-mono text-[14px] outline-none focus:border-[#B5101F]"
          />
          <button type="submit" className="self-start rounded-[12px] px-5 py-3 text-[14px] font-extrabold text-white" style={{ background: RED }}>
            Consultar
          </button>
        </form>
        {problem && <p className="mt-3 text-[13.5px] font-bold text-[#B5101F]">{problem}</p>}
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <h1 className="m-0 text-[24px] font-black">Estado da candidatura</h1>
        <p className="mt-3 text-[15px] font-semibold text-[#6a5a5e]">{problem ?? 'A carregar…'}</p>
      </Card>
    );
  }

  const copy = STATUS_COPY[status.status];
  const toSend = documentsToSend(status);
  const req = status.requirements;
  const waiting = status.status === 'INFORMATION_REQUIRED';

  return (
    <Card>
      <div data-testid="application-status" data-status={status.status}>
        <div className="font-mono text-[12.5px] font-bold text-[#9a8a8e]">
          Referência {status.application_id.slice(0, 8).toUpperCase()} · @{status.requested_handle}
        </div>
        <h1 className="m-0 mt-2 text-[26px] font-black tracking-[-0.02em]">{copy.title}</h1>
        <p className="mt-2 text-[15px] font-semibold leading-[1.55] text-[#6a5a5e]">{copy.body}</p>
      </div>

      {waiting && status.information_request && (
        <div data-testid="information-request" className="mt-5 rounded-[14px] border border-[#f1d9a8] bg-[#FFF8EC] p-4">
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-[#7a5a1e]">Pedido da equipa Banzami</div>
          <p className="m-0 mt-1 text-[15px] font-bold text-[#5a4012]">{status.information_request}</p>
        </div>
      )}

      {toSend.length > 0 && (
        <section className="mt-6">
          <h2 className="m-0 text-[16px] font-black">Documentos a enviar</h2>
          {storageOff && (
            <p className="mt-2 text-[13.5px] font-semibold text-[#7a6a6e]">
              O envio de documentos ainda não está disponível neste ambiente. A equipa Banzami será avisada.
            </p>
          )}
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {toSend.map((item) => {
              const st = docs[item.code] ?? { status: 'idle' };
              const id = `doc-${item.code}`;
              return (
                <li key={item.code} className="rounded-[14px] border border-[#f1e3e3] bg-white p-4">
                  <label htmlFor={id} className="block text-[14px] font-extrabold">{item.label}</label>
                  <div className="mt-0.5 text-[12.5px] font-semibold text-[#9a8a8e]">
                    {item.reason.startsWith('REJECTED') ? `Recusado${item.reason.length > 9 ? ' — ' + item.reason.slice(10) : ''}` : 'Em falta'} ·
                    PDF, JPG ou PNG até 5 MB
                  </div>
                  <input
                    id={id}
                    type="file"
                    accept={ACCEPT}
                    disabled={st.status === 'uploading'}
                    onChange={(e) => void send(item, e.target.files?.[0])}
                    className="mt-2 text-[13px]"
                  />
                  {st.status === 'uploading' && <div className="mt-1 text-[12.5px] font-bold text-[#9a8a8e]">A enviar…</div>}
                  {st.status === 'done' && <div className="mt-1 text-[12.5px] font-bold text-[#1f9d57]">Enviado</div>}
                  {st.status === 'error' && <div className="mt-1 text-[12.5px] font-bold text-[#B5101F]">{st.message}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(req.pending_verification.length > 0 || req.accepted.length > 0) && (
        <section className="mt-6">
          <h2 className="m-0 text-[16px] font-black">Já recebido</h2>
          <ul className="m-0 mt-2 list-none p-0">
            {[...req.pending_verification, ...req.accepted].map((i) => (
              <li key={i.code} className="flex justify-between py-1 text-[14px]">
                <span className="font-bold">{i.label}</span>
                <span className="font-semibold text-[#7a6a6e]">{i.reason === 'ACCEPTED' ? 'Aceite' : 'Por verificar'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {waiting && (
        <div className="mt-6">
          <button
            onClick={() => void resubmit()}
            disabled={resubmitting}
            className="rounded-[12px] px-5 py-3 text-[14px] font-extrabold text-white disabled:opacity-50"
            style={{ background: RED }}
          >
            {resubmitting ? 'A reenviar…' : 'Reenviar para análise'}
          </button>
        </div>
      )}
      {notice && <p className="mt-3 text-[13.5px] font-bold text-[#6a5a5e]">{notice}</p>}

      <p className="mt-8 text-[13px] font-semibold text-[#9a8a8e]">
        Dúvidas? <Link href="mailto:contact@banzami.com" className="font-extrabold" style={{ color: RED }}>contact@banzami.com</Link>
      </p>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[26px] bg-white p-8 shadow-[0_30px_80px_-50px_rgba(181,16,31,0.4)]">{children}</div>;
}
