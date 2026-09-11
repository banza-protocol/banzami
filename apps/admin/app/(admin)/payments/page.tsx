'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, type Payout } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/components/ui/dialog';
import { formatMoney, formatDate } from '@/lib/format';
import { payoutActions, PAYOUT_ACTION_LABEL, type PayoutAction } from '@/lib/payouts';
import { takeReason } from '@/lib/reason';
import { AttentionFilterBar } from '@/components/ui/attention-chip';
import { useAttentionCategory, useAttentionView } from '@/components/layout/attention-provider';
import { filterByStates } from '@/lib/attention';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

// "Levantamentos" — the payouts API: money leaving a Business wallet for its
// bank account. (Payments RECEIVED are a different page: /wallet-payments.)
// Per-payout consumer @handles aren't exposed by the API, so the flow column
// shows the destination account holder.
//
// Each row offers only the transitions Core accepts from its status
// (lib/payouts.ts); Core still decides.

const ACTION_STYLE: Record<PayoutAction, string> = {
  process: 'bg-[#1a1416] text-white hover:bg-black',
  sent:    'bg-[#1a1416] text-white hover:bg-black',
  confirm: 'bg-[#1f9d57] text-white hover:brightness-105',
  return:  'bg-[#FFF1F0] text-[#B5101F]',
  fail:    'border-[1.5px] border-[#f1e3e3] bg-white text-[#7a6a6e] hover:bg-[#FFF7F6]',
};

export default function PaymentsPage() {
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [attention, setAttention] = useAttentionView();
  const { states } = useAttentionCategory('payouts');

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listAllPayouts();
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar os levantamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(p: Payout, action: PayoutAction) {
    const api = getApi();
    if (!api) return;
    const ref = p.id.slice(0, 10);
    const amount = formatMoney(p.amount?.amount_minor, p.amount?.currency);

    let reason: string | null = null;
    if (action === 'return' || action === 'fail') {
      reason = takeReason(await dialog.prompt({
        title: action === 'return' ? 'Devolver levantamento' : 'Marcar levantamento como falhado',
        label: action === 'return' ? 'Motivo da devolução' : 'Motivo da falha',
        multiline: true,
        confirmLabel: PAYOUT_ACTION_LABEL[action],
        required: true,
      }));
      if (reason === null) return;
    } else {
      const message = {
        process: `Processar o levantamento ${ref} de ${amount}? O valor sai da carteira do negócio para envio ao banco. Fica registado no log de auditoria.`,
        sent:    `Marcar o levantamento ${ref} de ${amount} como enviado ao banco? Fica registado no log de auditoria.`,
        confirm: `Confirmar que o banco recebeu o levantamento ${ref} de ${amount}? Esta é uma ação financeira definitiva e fica registada no log de auditoria.`,
      }[action];
      const okGo = await dialog.confirm({
        title: `${PAYOUT_ACTION_LABEL[action]} levantamento`,
        message,
        confirmLabel: PAYOUT_ACTION_LABEL[action],
      });
      if (!okGo) return;
    }

    setBusy(p.id);
    try {
      if (action === 'process') await api.processPayout(p.id);
      else if (action === 'sent') await api.markPayoutSent(p.id);
      else if (action === 'confirm') await api.confirmPayout(p.id);
      else if (action === 'return') await api.markPayoutReturned(p.id, reason!);
      else await api.failPayout(p.id, reason!);
      toast('success', {
        process: 'Levantamento em processamento.',
        sent:    'Levantamento marcado como enviado.',
        confirm: 'Levantamento confirmado.',
        return:  'Levantamento devolvido.',
        fail:    'Levantamento marcado como falhado.',
      }[action]);
      await load();
    } catch {
      toast('danger', 'Não foi possível atualizar o levantamento. Recarregue para ver o estado atual.');
    } finally {
      setBusy(null);
    }
  }

  const view = attention ? filterByStates(rows, states, (r) => r.status) : rows;
  const bar = <AttentionFilterBar attentionKey="payouts" active={attention} onChange={setAttention} />;

  if (loading) return <>{bar}<Card><div className="adm-skel m-6 h-[200px] rounded-[14px]" /></Card></>;
  if (error) return <>{bar}<Card><ErrorState message={error} /></Card></>;
  if (view.length === 0) return <>{bar}<Card><EmptyMsg title={attention ? 'Nenhum levantamento requer atenção.' : 'Ainda não há levantamentos.'} /></Card></>;

  return (
    <>
    {bar}
    <TableWrap>
      <thead>
        <tr className="bg-[#FFF7F6]">
          <Th>Levantamento</Th>
          <Th>Destino</Th>
          <Th right>Valor</Th>
          <Th>Data</Th>
          <Th>Estado</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {view.map((p) => {
          const actions = payoutActions(p.status);
          return (
            <tr key={p.id} className="adm-row transition-colors">
              <Td mono className="font-extrabold text-[#B5101F]">{p.id.slice(0, 10)}</Td>
              <Td mono className="font-semibold text-[#5a4a4e]">{p.destination?.account_holder_name || p.merchant_id.slice(0, 8)}</Td>
              <Td right mono className="font-extrabold">{formatMoney(p.amount?.amount_minor, p.amount?.currency)}</Td>
              <Td mono className="font-semibold text-[#5a4a4e]">{formatDate(p.created_at)}</Td>
              <Td><Badge label={statusLabelPt(p.status)} /></Td>
              <Td right>
                {actions.length > 0 ? (
                  <div className="flex justify-end gap-2">
                    {actions.map((a) => (
                      <button
                        key={a}
                        onClick={() => run(p, a)}
                        disabled={busy === p.id}
                        className={`rounded-[30px] px-[14px] py-2 text-[13px] font-extrabold transition disabled:opacity-50 ${ACTION_STYLE[a]}`}
                      >
                        {PAYOUT_ACTION_LABEL[a]}
                      </button>
                    ))}
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
    </>
  );
}
