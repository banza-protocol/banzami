'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type AcquiringReconRun } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, CardHeader, Th, Td, EmptyMsg } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatKz, formatDate } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

export default function ReconciliationPage() {
  const toast = useToast();
  const [runs, setRuns] = useState<AcquiringReconRun[]>([]);
  const [last, setLast] = useState<AcquiringReconRun | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    try {
      const r = await api.listAcquiringReconciliationRuns();
      setRuns(r.data);
    } catch {
      /* show empty history */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    const api = getApi();
    if (!api) return;
    setRunning(true);
    try {
      const result = await api.runAcquiringReconciliation();
      setLast(result);
      const div = (result.amount_mismatch ?? 0) + (result.missing_posting ?? 0);
      toast(div > 0 ? 'warning' : 'success', div > 0 ? `Reconciliação concluída — ${div} divergências.` : 'Reconciliação concluída — sem divergências.');
      await load();
    } catch {
      toast('danger', 'Não foi possível executar a reconciliação.');
    } finally {
      setRunning(false);
    }
  }

  const divergences = (last?.items ?? []).filter((i) => i.status !== 'MATCHED');

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#f1e3e3] bg-white px-6 py-[22px]">
        <div>
          <h3 className="m-0 text-[16px] font-black">Reconciliação manual</h3>
          <p className="m-0 mt-[5px] text-[13.5px] font-semibold text-[#9a8a8e]">
            Compara liquidações esperadas com os movimentos recebidos e identifica divergências.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-[9px] rounded-[14px] bg-[#1a1416] px-6 py-[14px] text-[14.5px] font-extrabold text-white transition hover:bg-black disabled:opacity-60"
        >
          <RefreshCw size={17} strokeWidth={1.9} className={running ? 'adm-spin' : ''} />
          {running ? 'A executar…' : 'Executar reconciliação'}
        </button>
      </div>

      {last && (
        <Card className="mb-4">
          <CardHeader title={`Reconciliação concluída — ${divergences.length} divergências encontradas`} />
          {divergences.length === 0 ? (
            <EmptyMsg title="Sem divergências nesta execução." />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FFF7F6]">
                  <Th>Referência</Th>
                  <Th right>Esperado</Th>
                  <Th right>Recebido</Th>
                  <Th right>Δ</Th>
                </tr>
              </thead>
              <tbody>
                {divergences.map((d) => (
                  <tr key={d.id}>
                    <Td mono className="font-extrabold text-[#B5101F]">{d.external_ref}</Td>
                    <Td right mono className="font-bold">{formatKz(d.ledger_amount_minor)}</Td>
                    <Td right mono className="font-bold">{formatKz(d.callback_amount_minor)}</Td>
                    <Td right mono className="font-extrabold text-[#B5101F]">{formatKz(d.discrepancy_minor)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Histórico de reconciliações" />
        {loading ? (
          <div className="adm-skel m-6 h-[160px] rounded-[14px]" />
        ) : runs.length === 0 ? (
          <EmptyMsg title="Ainda não há execuções de reconciliação." />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#FFF7F6]">
                <Th>Execução</Th>
                <Th>Data</Th>
                <Th right>Movimentos</Th>
                <Th>Divergências</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const div = (r.amount_mismatch ?? 0) + (r.missing_posting ?? 0);
                return (
                  <tr key={r.id}>
                    <Td mono className="font-extrabold text-[#B5101F]">{r.id.slice(0, 10)}</Td>
                    <Td mono className="font-semibold text-[#5a4a4e]">{formatDate(r.reconciliation_date)}</Td>
                    <Td right mono className="font-bold">{r.total_callbacks}</Td>
                    <Td className="font-extrabold" >
                      <span style={{ color: div > 0 ? '#B5101F' : '#1f9d57' }}>{div}</span>
                    </Td>
                    <Td><Badge label={statusLabelPt(r.status)} variant={r.status === 'COMPLETED' ? 'success' : r.status === 'FAILED' ? 'danger' : 'warning'} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
