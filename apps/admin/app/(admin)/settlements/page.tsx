'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type Settlement } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/format';
import { AttentionFilterBar } from '@/components/ui/attention-chip';
import { useAttentionCategory, useAttentionView } from '@/components/layout/attention-provider';
import { filterByStates } from '@/lib/attention';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

export default function SettlementsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [attention, setAttention] = useAttentionView();
  const { states } = useAttentionCategory('settlements');

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listAllSettlements();
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar as liquidações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Avançar: PENDING → submit; SUBMITTED → confirm. SETTLED/FAILED → terminal.
  async function advance(s: Settlement) {
    const api = getApi();
    if (!api) return;
    setBusy(s.id);
    try {
      if (s.status === 'PENDING') {
        await api.submitSettlement(s.id);
        toast('success', 'Liquidação submetida.');
      } else if (s.status === 'SUBMITTED') {
        await api.confirmSettlement(s.id);
        toast('success', 'Liquidação confirmada.');
      }
      await load();
    } catch {
      toast('danger', 'Não foi possível avançar a liquidação.');
    } finally {
      setBusy(null);
    }
  }

  const view = attention ? filterByStates(rows, states, (r) => r.status) : rows;

  return (
    <>
      <div className="mb-4 flex items-center gap-[9px] rounded-[14px] border border-[#f6d3d1] bg-[#FFF1F0] px-[18px] py-[14px] text-[13.5px] font-bold text-[#9A1B22]">
        <AlertCircle size={16} strokeWidth={1.7} />
        Ciclo de vida: <span className="font-mono">Pendente → Submetido → Liquidado</span>. Usa <strong>Avançar</strong> para progredir o estado.
      </div>

      <AttentionFilterBar attentionKey="settlements" active={attention} onChange={setAttention} />

      {loading ? (
        <Card><div className="adm-skel m-6 h-[200px] rounded-[14px]" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} /></Card>
      ) : view.length === 0 ? (
        <Card><EmptyMsg title={attention ? 'Nenhuma liquidação requer atenção.' : 'Ainda não há liquidações.'} /></Card>
      ) : (
        <TableWrap>
          <thead>
            <tr className="bg-[#FFF7F6]">
              <Th>Liquidação</Th>
              <Th>Comerciante</Th>
              <Th right>Valor</Th>
              <Th>Data</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {view.map((s) => {
              const canAdvance = s.status === 'PENDING' || s.status === 'SUBMITTED';
              return (
                <tr key={s.id} className="adm-row transition-colors">
                  <Td mono className="font-extrabold text-[#B5101F]">{s.id.slice(0, 10)}</Td>
                  <Td className="font-bold">{s.merchant_id.slice(0, 10)}…</Td>
                  <Td right mono className="font-extrabold">{formatMoney(s.net_amount?.amount_minor, s.net_amount?.currency ?? s.currency)}</Td>
                  <Td mono className="font-semibold text-[#5a4a4e]">{formatDate(s.created_at)}</Td>
                  <Td><Badge label={statusLabelPt(s.status)} /></Td>
                  <Td right>
                    {canAdvance ? (
                      <button
                        onClick={() => advance(s)}
                        disabled={busy === s.id}
                        className="rounded-[30px] bg-[#1a1416] px-[14px] py-2 text-[13px] font-extrabold text-white transition hover:bg-black disabled:opacity-50"
                      >
                        Avançar →
                      </button>
                    ) : (
                      <span className="text-[13px] font-bold text-[#9a8a8e]">{s.status === 'SETTLED' ? 'Concluído' : '—'}</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
