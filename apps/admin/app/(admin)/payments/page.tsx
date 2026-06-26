'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, type Payout } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatKz, formatDate } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

// "Pagamentos" is backed by the real payouts API (the admin payment flow with
// Confirmar/Devolver actions). Per-payout consumer @handles aren't exposed by
// the API, so the flow column shows merchant → destination.
const TERMINAL = ['CONFIRMED', 'FAILED', 'RETURNED'];

export default function PaymentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listAllPayouts();
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar os pagamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(p: Payout) {
    const api = getApi();
    if (!api) return;
    setBusy(p.id);
    try {
      await api.confirmPayout(p.id);
      toast('success', 'Pagamento confirmado.');
      await load();
    } catch {
      toast('danger', 'Não foi possível confirmar o pagamento.');
    } finally {
      setBusy(null);
    }
  }

  async function devolver(p: Payout) {
    const api = getApi();
    if (!api) return;
    const reason = window.prompt('Motivo da devolução:');
    if (!reason || !reason.trim()) return;
    setBusy(p.id);
    try {
      await api.markPayoutReturned(p.id, reason.trim());
      toast('success', 'Pagamento devolvido.');
      await load();
    } catch {
      toast('danger', 'Não foi possível devolver o pagamento.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Card><div className="adm-skel m-6 h-[200px] rounded-[14px]" /></Card>;
  if (error) return <Card><ErrorState message={error} /></Card>;
  if (rows.length === 0) return <Card><EmptyMsg title="Ainda não há pagamentos." /></Card>;

  return (
    <TableWrap>
      <thead>
        <tr className="bg-[#FFF7F6]">
          <Th>Transação</Th>
          <Th>Destino</Th>
          <Th right>Valor</Th>
          <Th>Data</Th>
          <Th>Estado</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const actionable = !TERMINAL.includes(p.status);
          return (
            <tr key={p.id} className="adm-row transition-colors">
              <Td mono className="font-extrabold text-[#B5101F]">{p.id.slice(0, 10)}</Td>
              <Td mono className="font-semibold text-[#5a4a4e]">{p.destination?.account_holder_name || p.merchant_id.slice(0, 8)}</Td>
              <Td right mono className="font-extrabold">{formatKz(p.amount?.amount_minor)}</Td>
              <Td mono className="font-semibold text-[#5a4a4e]">{formatDate(p.created_at)}</Td>
              <Td><Badge label={statusLabelPt(p.status)} /></Td>
              <Td right>
                {actionable ? (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => confirm(p)}
                      disabled={busy === p.id}
                      className="rounded-[30px] bg-[#1f9d57] px-[14px] py-2 text-[13px] font-extrabold text-white transition hover:brightness-105 disabled:opacity-50"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => devolver(p)}
                      disabled={busy === p.id}
                      className="rounded-[30px] bg-[#FFF1F0] px-[14px] py-2 text-[13px] font-extrabold text-[#B5101F] transition disabled:opacity-50"
                    >
                      Devolver
                    </button>
                  </div>
                ) : (
                  <span className="text-[13px] font-bold text-[#9a8a8e]">—</span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}
