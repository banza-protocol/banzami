'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type AdminDispute } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatKz } from '@/lib/format';
import { actionErrorPt } from '@/lib/errors';
import {
  DISPUTE_OUTCOMES, OUTCOME_EFFECT, OUTCOME_LABEL, disputeStatusLabel, isDisputeClosed, type DisputeOutcome,
} from '@/lib/disputes';
import { AttentionFilterBar } from '@/components/ui/attention-chip';
import { useAttentionCategory, useAttentionView } from '@/components/layout/attention-provider';
import { filterByStates } from '@/lib/attention';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

// Open work is loud; a dispute with an outcome is history.
function statusVariant(status: string): 'warning' | 'danger' | 'neutral' {
  const s = status.toUpperCase();
  if (s === 'OPEN') return 'danger';
  if (s === 'UNDER_REVIEW') return 'warning';
  return 'neutral';
}

export default function DisputesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState<AdminDispute | null>(null);
  const [attention, setAttention] = useAttentionView();
  const { states } = useAttentionCategory('disputes');

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listDisputes({ limit: 100 });
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar as disputas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(d: AdminDispute, outcome: DisputeOutcome, notes: string) {
    const api = getApi();
    if (!api) return;
    setBusy(d.id);
    try {
      await api.resolveDispute(d.id, outcome, notes);
      toast('success', `Disputa resolvida — ${OUTCOME_LABEL[outcome].toLowerCase()}.`);
      setResolving(null);
      await load();
    } catch (e) {
      toast('danger', actionErrorPt(e, 'Não foi possível resolver a disputa.'));
    } finally {
      setBusy(null);
    }
  }

  const view = attention ? filterByStates(rows, states, (r) => r.status) : rows;
  const bar = <AttentionFilterBar attentionKey="disputes" active={attention} onChange={setAttention} />;

  if (loading) return <>{bar}<Card><div className="adm-skel m-6 h-[200px] rounded-[14px]" /></Card></>;
  if (error) return <>{bar}<Card><ErrorState message={error} /></Card></>;
  if (view.length === 0) return <>{bar}<Card><EmptyMsg title={attention ? 'Nenhuma disputa requer atenção.' : 'Ainda não há disputas.'} /></Card></>;

  return (
    <>
    {bar}
    <TableWrap>
      <thead>
        <tr className="bg-[#FFF7F6]">
          <Th>Disputa</Th>
          <Th>Comerciante / Consumidor</Th>
          <Th>Motivo</Th>
          <Th right>Valor</Th>
          <Th>Estado</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {view.map((d) => {
          const closed = isDisputeClosed(d.status);
          return (
            <tr key={d.id} className="adm-row transition-colors">
              <Td>
                <div className="font-mono text-[13.5px] font-extrabold text-[#B5101F]">{d.id.slice(0, 10)}</div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold text-[#9a8a8e]">{d.transaction_id.slice(0, 10)}</div>
              </Td>
              <Td>
                <div className="text-[14px] font-bold">{d.merchant_id.slice(0, 8)}…</div>
                <div className="font-mono text-[12px] font-semibold text-[#9a8a8e]">{d.consumer_id.slice(0, 8)}…</div>
              </Td>
              <Td className="font-semibold text-[#5a4a4e]">{d.reason || '—'}</Td>
              <Td right mono className="font-extrabold">{formatKz(d.amount_minor)}</Td>
              <Td><Badge label={disputeStatusLabel(d.status)} variant={statusVariant(d.status)} /></Td>
              <Td right>
                {closed ? (
                  <span className="text-[13px] font-bold text-[#9a8a8e]">Encerrada</span>
                ) : (
                  <button
                    onClick={() => setResolving(d)}
                    disabled={busy === d.id}
                    className="rounded-[30px] bg-[#1a1416] px-[14px] py-2 text-[13px] font-extrabold text-white transition hover:bg-black disabled:opacity-50"
                  >
                    Resolver
                  </button>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
    {resolving && (
      <ResolveModal
        dispute={resolving}
        busy={busy === resolving.id}
        onCancel={() => setResolving(null)}
        onResolve={(outcome, notes) => resolve(resolving, outcome, notes)}
      />
    )}
    </>
  );
}

// One fixed choice among Core's outcomes, each saying what it does to money,
// then an explicit, labelled confirm. Never a free-text outcome.
function ResolveModal({ dispute, busy, onCancel, onResolve }: {
  dispute: AdminDispute;
  busy: boolean;
  onCancel: () => void;
  onResolve: (outcome: DisputeOutcome, notes: string) => void;
}) {
  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const movesMoney = outcome === 'WON_BY_CONSUMER';
  const btn = 'rounded-[12px] px-5 py-2.5 text-[14px] font-extrabold transition disabled:opacity-50';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-label="Resolver disputa"
        className="w-full max-w-[480px] rounded-[20px] border border-[#f1e3e3] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[18px] font-black tracking-[-0.01em]">Resolver disputa {dispute.id.slice(0, 10)}</h2>
          <button onClick={onCancel} aria-label="Fechar" className="text-[#9a8a8e] hover:text-[#2a2024]">
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
        <p className="m-0 mb-3 text-[13.5px] font-semibold text-[#5a4a4e]">
          Valor em disputa: <span className="font-mono font-extrabold">{formatKz(dispute.amount_minor)}</span>. A decisão é definitiva e fica registada no log de auditoria.
        </p>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-[13px] font-extrabold">Resultado</legend>
          {DISPUTE_OUTCOMES.map((o) => (
            <label
              key={o}
              className={`flex cursor-pointer gap-3 rounded-[14px] border-[1.5px] px-4 py-3 ${outcome === o ? 'border-[#B5101F] bg-[#FFF7F6]' : 'border-[#f1e3e3]'}`}
            >
              <input type="radio" name="dispute-outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="mt-1 accent-[#B5101F]" />
              <span>
                <span className="block text-[14px] font-extrabold">{OUTCOME_LABEL[o]}</span>
                <span className="block text-[12.5px] font-semibold text-[#7a6a6e]">{OUTCOME_EFFECT[o]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="mb-1.5 mt-4 block text-[13px] font-extrabold" htmlFor="dispute-notes">Notas de resolução (opcional)</label>
        <textarea
          id="dispute-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none focus:border-[#B5101F]"
        />
        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onCancel} className={`${btn} border-[1.5px] border-[#f1e3e3] bg-white text-[#5a4a4e] hover:bg-[#FFF7F6]`}>Cancelar</button>
          <button
            onClick={() => outcome && onResolve(outcome, notes.trim())}
            disabled={!outcome || busy}
            className={`${btn} text-white ${movesMoney ? 'bg-[#B5101F] hover:bg-[#9A1B22]' : 'bg-[#1a1416] hover:bg-black'}`}
          >
            {busy ? 'A resolver…' : movesMoney ? 'Resolver e restituir' : 'Resolver'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
