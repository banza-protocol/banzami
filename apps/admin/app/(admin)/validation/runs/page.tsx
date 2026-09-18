'use client';

/**
 * Historical executions.
 *
 * The one thing this table must never allow is mistaking a CANCELLED run for an
 * executed one. So state is rendered as the stored enum PLUS a presentation
 * note — `CANCELLED · Nunca iniciada` — and the columns that follow are about
 * EVIDENCE, not status: whether provenance was captured, whether a preflight
 * was persisted, what ran, what was recorded.
 */

import { useRouter } from 'next/navigation';
import { PlayCircle, Ban, FileText, Boxes, ShieldCheck } from 'lucide-react';
import { useStudio, getApi } from '../studio-context';
import { useToast } from '@/components/ui/toast';
import { getSession } from '@/lib/session';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { ValidationRun } from '@/lib/admin-api';
import {
  Panel, SectionHeader, Pill, Button, Empty, MetricCard, Why, Dot, STATE_STYLE,
} from '../studio-ui';

export default function RunsPage() {
  const s = useStudio();
  const toast = useToast();
  const router = useRouter();
  const canRun = ['SUPER_ADMIN', 'OPERATIONS'].includes(getSession()?.user.role ?? '');
  const terminal = ['COMPLETED', 'CANCELLED', 'ABANDONED'];

  async function cancel(r: ValidationRun) {
    const api = getApi();
    if (!api) return;
    s.setBusy(true);
    try {
      await api.validationCancelRun(r.id, 'cancelada pelo operador no BANZADMIN');
      toast('success', `${r.run_ref} cancelada.`);
      await s.reload();
    } catch {
      toast('danger', 'Não foi possível cancelar a execução.');
    } finally { s.setBusy(false); }
  }

  const everStarted = s.runs.filter((r) => r.started_at).length;
  const withProvenance = s.runs.filter((r) => (r.provenance_components ?? 0) > 0).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard Icon={PlayCircle} label="No histórico" value={s.runs.length}
          caption="preparadas alguma vez" />
        <MetricCard Icon={PlayCircle} label="Activas" tone={s.overview?.active_run ? 'warn' : 'neutral'}
          value={s.overview?.active_run ? 1 : 0} caption="a deter o Sandbox" />
        <MetricCard Icon={Ban} label="Alguma vez iniciadas" tone={everStarted ? 'warn' : 'good'}
          value={everStarted} caption="started_at preenchido" />
        <MetricCard Icon={Boxes} label="Com proveniência" tone={withProvenance === s.runs.length ? 'good' : 'warn'}
          value={`${withProvenance}/${s.runs.length}`} caption="capturada na preparação" />
      </div>

      <Panel className="p-5">
        <SectionHeader Icon={PlayCircle} title={`Execuções (${s.runs.length})`}
          subtitle="Uma execução é evidência: não pode ser apagada, e o histórico não pode ser reescrito." />

        {s.runs.length === 0 ? (
          <div className="mt-4">
            <Empty Icon={FileText} title="Nenhuma execução foi preparada"
              detail="O Validation Studio prepara e verifica execuções, mas não as inicia." />
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
                  <tr>
                    <th className="py-2 pr-4">Referência</th>
                    <th className="py-2 pr-4">Perfil</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Preparada</th>
                    <th className="py-2 pr-4">Proveniência</th>
                    <th className="py-2 pr-4">Verificação</th>
                    <th className="py-2 pr-4">Executado</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {s.runs.map((r) => {
                    const prov = r.provenance_components ?? 0;
                    return (
                      <tr key={r.id} className="border-b border-[#faf0f0] align-top">
                        <td className="py-2.5 pr-4">
                          <button onClick={() => router.push(`/validation/runs/${r.run_ref}`)}
                            className="font-mono font-extrabold hover:underline">{r.run_ref}</button>
                        </td>
                        <td className="py-2.5 pr-4">{r.profile_id} <span className="text-[#a99a9e]">v{r.profile_version}</span></td>
                        <td className="py-2.5 pr-4">
                          <span className="flex flex-col gap-1">
                            <Pill className={STATE_STYLE[r.state]}>{r.state}</Pill>
                            {!r.started_at && (
                              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[#a99a9e]">
                                nunca iniciada
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-[#9a8a8e]" title={formatDateTime(r.requested_at)}>
                          {timeAgo(r.requested_at)}
                        </td>
                        <td className="py-2.5 pr-4">
                          {prov > 0
                            ? <Pill className="bg-[#E9F7EE] text-green-800"><Dot tone="good" />{prov} componentes</Pill>
                            : <Pill className="bg-[#FDF3E0] text-amber-900"><Dot tone="warn" />não capturada</Pill>}
                        </td>
                        <td className="py-2.5 pr-4">
                          {r.preflight_verdict
                            ? <Pill className={r.preflight_verdict === 'HEALTHY' ? 'bg-[#E9F7EE] text-green-800' : 'bg-[#FDF3E0] text-amber-900'}>
                                {r.preflight_verdict}
                              </Pill>
                            : <span className="text-[12px] text-[#a99a9e]">não persistida</span>}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-[12.5px]">
                            {r.journeys_executed ?? 0} percursos · {r.evidence_rows ?? 0} artefactos
                          </span>
                        </td>
                        <td className="py-2.5">
                          {canRun && !terminal.includes(r.state) && (
                            <Button onClick={() => void cancel(r)} disabled={s.busy}>Cancelar</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Why>
              Uma execução com <strong>proveniência não capturada</strong> é anterior à correcção
              C.10 e permanece assim: a incompletude histórica é evidência, e preenchê-la a partir
              dos valores de hoje apagaria a única coisa para que ainda serve.
            </Why>
          </>
        )}
      </Panel>
    </div>
  );
}
