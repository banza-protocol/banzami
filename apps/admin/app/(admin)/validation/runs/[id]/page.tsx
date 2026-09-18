'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, PlayCircle, Boxes, ShieldCheck, Clock, FileText, FileSliders } from 'lucide-react';
import { getApi } from '../../studio-context';
import { formatDateTime } from '@/lib/format';
import type {
  ValidationRun, ValidationRunEvent, ValidationProvenanceRow, ValidationPinnedPreflight,
} from '@/lib/admin-api';
import {
  Panel, SectionHeader, Pill, Field, AsOf, Why, Empty, Skeleton, Hash, STATE_STYLE, CHECK_STYLE,
} from '../../studio-ui';

type Detail = {
  run: ValidationRun; events: ValidationRunEvent[];
  pinned_provenance: ValidationProvenanceRow[];
  pinned_preflight: ValidationPinnedPreflight | null;
  provenance_captured: boolean; ever_started: boolean;
  journeys_executed: number; evidence_rows: number;
};

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const api = getApi();
    if (!api || !id) return;
    api.validationRun(id).then(setD).catch(() => setErr('Não foi possível carregar a execução.'));
  }, [id]);

  if (err) return <Panel className="p-6"><p className="text-[14px] font-bold text-red-800">{err}</p></Panel>;
  if (!d) return <div className="flex flex-col gap-[18px]"><Skeleton className="h-[160px]" /><Skeleton className="h-[220px]" /></div>;

  const { run, events, pinned_provenance: prov, pinned_preflight: pf } = d;

  return (
    <div className="flex flex-col gap-[18px]">
      <button onClick={() => router.push('/validation/runs')}
        className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#9a8a8e] hover:text-[#1a1a1a]">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todas as execuções
      </button>

      <Panel className="p-5">
        <SectionHeader Icon={PlayCircle} title={run.run_ref}
          subtitle={`${run.profile_id} v${run.profile_version} · ${run.environment}`}
          action={
            <span className="flex flex-wrap items-center gap-1.5">
              <Pill className={STATE_STYLE[run.state]}>{run.state}</Pill>
              {!run.started_at && <Pill className="bg-[#F1EEEE] text-[#6a5a5e]">NUNCA INICIADA</Pill>}
            </span>} />
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3.5 md:grid-cols-4">
          <Field label="Veredicto">{run.verdict ?? '—'}</Field>
          <Field label="Preparada">{formatDateTime(run.requested_at)}</Field>
          <Field label="Iniciada">
            {run.started_at ? formatDateTime(run.started_at) : <span className="font-extrabold text-green-700">nunca</span>}
          </Field>
          <Field label="Terminada">{run.ended_at ? formatDateTime(run.ended_at) : '—'}</Field>
          <Field label="Percursos executados">{d.journeys_executed}</Field>
          <Field label="Evidência">{d.evidence_rows}</Field>
          <Field label="Digest do perfil"><Hash value={run.profile_digest} chars={16} /></Field>
          {run.cancel_reason && <Field label="Motivo do cancelamento">{run.cancel_reason}</Field>}
        </dl>
      </Panel>

      <Panel className="p-5">
        <SectionHeader Icon={Boxes} title="Proveniência" subtitle="Os componentes contra os quais esta execução foi avaliada."
          action={<AsOf live={false} at={formatDateTime(run.requested_at)} />} />
        {prov.length === 0 ? (
          <div className="mt-4">
            <Empty title="Sem proveniência capturada"
              detail="Esta execução foi preparada antes de a captura de proveniência existir. A ausência é evidência histórica do defeito e não foi preenchida retroactivamente." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
                <tr><th className="py-2 pr-4">Componente</th><th className="py-2 pr-4">Revisão fixada</th><th className="py-2">Fonte</th></tr>
              </thead>
              <tbody>
                {prov.map((p) => (
                  <tr key={p.component} className="border-b border-[#faf0f0]">
                    <td className="py-2 pr-4 font-extrabold">{p.component}</td>
                    <td className="py-2 pr-4"><Hash value={p.revision} chars={16} /></td>
                    <td className="py-2 text-[12px] text-[#9a8a8e]">{p.detail?.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Why>
          Estas revisões continuam a dizer o que esta execução testou, mesmo depois de o Sandbox
          ser reimplantado. Nunca são recalculadas a partir do estado actual.
        </Why>
      </Panel>

      <Panel className="p-5">
        <SectionHeader Icon={ShieldCheck} title="Verificação prévia" subtitle="O instantâneo guardado com a execução."
          action={<AsOf live={false} at={pf ? formatDateTime(pf.started_at) : undefined} />} />
        {!pf ? (
          <div className="mt-4"><Empty title="Sem verificação persistida" detail="Nenhum instantâneo foi guardado com esta execução." /></div>
        ) : (
          <ul className="mt-4">
            {pf.checks.map((c) => (
              <li key={`${c.group}.${c.id}`} className="flex items-start gap-3 border-b border-[#faf0f0] py-2.5 last:border-0">
                <Pill className={`${CHECK_STYLE[c.status]} mt-[1px] flex-none`}>{c.status}</Pill>
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[#a99a9e]">{c.group}/{c.id}</p>
                  <p className="text-[13px]">{c.detail}</p>
                  {c.measured && Object.keys(c.measured).length > 0 && (
                    <p className="mt-0.5 font-mono text-[11.5px] text-[#6a5a5e]">
                      {Object.entries(c.measured).map(([k, v]) => `${k}=${v}`).join('   ')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="p-5">
        <SectionHeader Icon={Clock} title="Cronologia" subtitle="Histórico append-only: não pode ser reescrito nem apagado." />
        <ol className="mt-4">
          {events.map((e, i) => (
            <li key={e.seq} className="flex gap-4">
              <span className="w-[74px] flex-none pt-[2px] font-mono text-[12px] text-[#a99a9e]">
                {new Date(e.occurred_at).toISOString().slice(11, 19)}
              </span>
              <div className="relative flex-1 pb-4">
                {i < events.length - 1 && <span className="absolute -left-[11px] top-[22px] h-full w-px bg-[#f1e3e3]" aria-hidden />}
                <span className="absolute -left-[15px] top-[7px] h-[9px] w-[9px] rounded-full border-2 border-white bg-[#cbbaba]" aria-hidden />
                <Pill className={STATE_STYLE[e.to_state]}>{e.to_state}</Pill>
                {e.reason && <p className="mt-1 text-[12.5px] text-[#6a5a5e]">{e.reason}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel className="p-5">
        <SectionHeader Icon={FileText} tone="neutral" title="Execução" subtitle="O que esta execução efectivamente correu." />
        <div className="mt-4">
          <Empty Icon={FileText} title="Nenhum percurso executado"
            detail="Esta execução nunca foi iniciada. Nenhuma asserção foi observada e nenhum artefacto foi capturado. Não existe motor de execução." />
        </div>
      </Panel>
    </div>
  );
}
