'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AdminApi, type ApplicationBusinessState } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/table';
import { BusinessStateRows } from '@/components/applications/ApplicationLifecycle';
import { formatDate, withAt } from '@/lib/format';

/**
 * One Business's whole institutional state: identity and @handle, KYB (the one
 * authority, merchant_compliance), class, wallet, pricing, Business App
 * access, the Developer Projects that receive into it and the applications
 * that resolved to it, and whether it can settle. An operator should not need
 * a second screen to know whether a Business is usable.
 */
export default function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const [api] = useState<AdminApi | null>(() => {
    const s = getSession();
    return s ? new AdminApi(s.token) : null;
  });
  const [state, setState] = useState<ApplicationBusinessState | null | undefined>(undefined);

  useEffect(() => {
    if (!api || !id) return;
    void (async () => {
      try {
        setState((await api.businessState(id)).business);
      } catch {
        setState(null);
      }
    })();
  }, [api, id]);

  if (state === undefined) return <p className="text-[14px] font-semibold text-[#9a8a8e]">A carregar…</p>;
  if (state === null) return <ErrorState message="Não foi possível carregar esta Business Account." />;

  return (
    <>
      <div className="mb-5">
        <div className="font-mono text-[14px] font-bold text-[#9a8a8e]">Business Account · {state.merchant_id}</div>
        <h1 data-testid="business-handle" className="m-0 mt-1 font-mono text-[28px] font-black text-[#B5101F]">
          {state.handle ? withAt(state.handle) : 'sem @handle'}
        </h1>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-[16px] font-extrabold">{state.name}</span>
          <Badge label={statusLabelPt(state.status)} />
        </div>
      </div>

      <div className="mb-4 rounded-[18px] border border-[#f1e3e3] bg-white p-6">
        <h3 className="m-0 mb-4 text-[15px] font-black">Estado institucional</h3>
        <BusinessStateRows state={state} />
      </div>

      <div className="grid grid-cols-2 gap-4 max-[1040px]:grid-cols-1">
        <div className="rounded-[18px] border border-[#f1e3e3] bg-white p-6">
          <h3 className="m-0 mb-3 text-[15px] font-black">Projetos de developer</h3>
          {(state.projects ?? []).length === 0 ? (
            <p className="m-0 text-[13.5px] font-semibold text-[#9a8a8e]">Nenhum projeto recebe nesta conta.</p>
          ) : (
            <ul className="m-0 list-none p-0" data-testid="business-projects">
              {state.projects!.map((p) => (
                <li key={p.project_id} className="flex justify-between gap-3 py-1.5 text-[14px]">
                  <span className="font-extrabold">{p.name || 'Projeto'} <span className="font-mono text-[12px] text-[#9a8a8e]">{p.project_id.slice(0, 8)}…</span></span>
                  <span className="font-bold text-[#7a6a6e]">{p.sealed ? 'Selado (ADR-055)' : 'Ligado'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-[18px] border border-[#f1e3e3] bg-white p-6">
          <h3 className="m-0 mb-3 text-[15px] font-black">Candidaturas</h3>
          {(state.applications ?? []).length === 0 ? (
            <p className="m-0 text-[13.5px] font-semibold text-[#9a8a8e]">
              Nenhuma candidatura resolvida para esta conta (criada antes do processo de candidatura, ou por consolidação).
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {state.applications!.map((a) => (
                <li key={a.application_id} className="flex justify-between gap-3 py-1.5 text-[14px]">
                  <a href={`/merchants/${a.application_id}`} className="font-extrabold text-[#B5101F]">
                    {a.application_id.slice(0, 8).toUpperCase()}
                  </a>
                  <span className="font-bold text-[#7a6a6e]">
                    {statusLabelPt(a.status)} · {a.resolution === 'LINKED_EXISTING' ? 'associada' : a.resolution === 'PROVISIONED_NEW' ? 'nova conta' : '—'} ·{' '}
                    {a.origin === 'DEVELOPER_PROJECT' ? 'projeto' : 'formulário'} · {formatDate(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
