'use client';

import { useRouter } from 'next/navigation';
import { PlayCircle, Ban, FileText } from 'lucide-react';
import { useStudio, getApi } from '../studio-context';
import { useToast } from '@/components/ui/toast';
import { getSession } from '@/lib/session';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { ValidationRun } from '@/lib/admin-api';
import { Panel, SectionHeader, Pill, Button, Empty, MetricCard, STATE_STYLE } from '../studio-ui';

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

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard Icon={PlayCircle} label="Execuções no histórico" value={s.runs.length} caption="preparadas alguma vez" />
        <MetricCard Icon={PlayCircle} label="Activas" tone={s.overview?.active_run ? 'warn' : 'neutral'}
          value={s.overview?.active_run ? 1 : 0} caption="a deter o Sandbox" />
        <MetricCard Icon={Ban} label="Alguma vez iniciadas" tone={everStarted ? 'warn' : 'good'}
          value={everStarted} caption="started_at não nulo" />
        <MetricCard Icon={FileText} label="Evidência de execução" tone="neutral" value={0}
          caption="nenhum percurso correu" />
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
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
                <tr>
                  <th className="py-2 pr-4">Referência</th><th className="py-2 pr-4">Perfil</th>
                  <th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Veredicto</th>
                  <th className="py-2 pr-4">Preparada</th><th className="py-2 pr-4">Iniciada</th><th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {s.runs.map((r) => (
                  <tr key={r.id} className="border-b border-[#faf0f0]">
                    <td className="cursor-pointer py-2.5 pr-4 font-mono font-extrabold hover:underline"
                      onClick={() => router.push(`/validation/runs/${r.id}`)}>{r.run_ref}</td>
                    <td className="py-2.5 pr-4">{r.profile_id} v{r.profile_version}</td>
                    <td className="py-2.5 pr-4">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Pill className={STATE_STYLE[r.state]}>{r.state}</Pill>
                        {!r.started_at && (
                          <Pill className="bg-[#F1EEEE] text-[#6a5a5e]">NUNCA INICIADA</Pill>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">{r.verdict ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-[#9a8a8e]" title={formatDateTime(r.requested_at)}>{timeAgo(r.requested_at)}</td>
                    <td className="py-2.5 pr-4">
                      {r.started_at ? formatDateTime(r.started_at) : <span className="font-bold text-green-700">nunca</span>}
                    </td>
                    <td className="py-2.5">
                      {canRun && !terminal.includes(r.state) && (
                        <Button onClick={() => void cancel(r)} disabled={s.busy}>Cancelar</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
