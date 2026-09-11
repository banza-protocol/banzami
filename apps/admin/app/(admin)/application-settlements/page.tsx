'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, ChevronDown, ChevronRight, Ban, AlertTriangle } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type ApplicationSettlement, type AppSettlementFilters } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, CardHeader, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/components/ui/dialog';
import { formatMoney, formatDate } from '@/lib/format';
import { AttentionFilterBar } from '@/components/ui/attention-chip';
import { useAttentionCategory, useAttentionView } from '@/components/layout/attention-provider';
import { filterByStates } from '@/lib/attention';

const CATEGORIES = ['DONATION', 'CROWDFUNDING', 'MARKETPLACE', 'ECOMMERCE', 'DELIVERY', 'FOOD_DELIVERY', 'RIDE_HAILING', 'SUBSCRIPTION', 'TICKETING', 'DIGITAL_GOODS', 'PHYSICAL_GOODS', 'P2P', 'BILL_PAYMENT', 'NGO', 'GOVERNMENT'];
const STATUSES = ['CREATED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];
const CURRENCIES = ['AOA', 'USD', 'EUR'];

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const selClass = 'rounded-[11px] border border-[#f1e3e3] bg-white px-[12px] py-[8px] text-[13px] font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]';

/** A settlement may be cancelled/failed only before a terminal state. */
function isMutable(s: ApplicationSettlement): boolean {
  return s.status === 'CREATED' || s.status === 'PENDING';
}

export default function ApplicationSettlementsPage() {
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<ApplicationSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AppSettlementFilters>({ environment: 'SANDBOX' });
  const [selected, setSelected] = useState<ApplicationSettlement | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attention, setAttention] = useAttentionView();
  const { states } = useAttentionCategory('application_settlements');
  const view = attention ? filterByStates(rows, states, (r) => r.status) : rows;

  const load = useCallback(async (f: AppSettlementFilters) => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listAppSettlements(f);
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar as liquidações de aplicações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters); }, [load, filters]);

  function set<K extends keyof AppSettlementFilters>(k: K, v: string) {
    setFilters({ ...filters, [k]: v || undefined });
  }

  async function refreshSelected(id: string) {
    const api = getApi();
    if (!api) return;
    try { setSelected(await api.getAppSettlement(id)); } catch { /* keep */ }
    await load(filters);
  }

  async function cancel(s: ApplicationSettlement) {
    const api = getApi();
    if (!api) return;
    const ok = await dialog.confirm({
      title: 'Cancelar liquidação',
      message: `Cancelar a liquidação de “${s.owner_ref}”? Só é possível antes de concluída.`,
      confirmLabel: 'Cancelar liquidação',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.cancelAppSettlement(s.id);
      toast('success', 'Liquidação cancelada.');
      await refreshSelected(s.id);
    } catch (e) {
      toast('danger', e instanceof Error ? e.message : 'Não foi possível cancelar.');
    } finally {
      setBusy(false);
    }
  }

  async function fail(s: ApplicationSettlement) {
    const api = getApi();
    if (!api) return;
    const reason = await dialog.prompt({
      title: 'Marcar como falhada',
      label: 'Motivo',
      placeholder: 'Motivo da falha',
      required: true,
      multiline: true,
    });
    if (!reason) return;
    setBusy(true);
    try {
      await api.failAppSettlement(s.id, reason);
      toast('success', 'Liquidação marcada como falhada.');
      await refreshSelected(s.id);
    } catch (e) {
      toast('danger', e instanceof Error ? e.message : 'Não foi possível marcar como falhada.');
    } finally {
      setBusy(false);
    }
  }

  const statusVariant = (s: string) =>
    s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'danger' : s === 'CANCELLED' ? 'neutral' : 'warning';

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-[18px] bg-[#1a1416] px-[26px] py-[22px] text-white">
        <h1 className="text-[23px] font-black tracking-[-0.02em]">Liquidações de aplicações</h1>
        <p className="mt-1 max-w-[760px] text-[13.5px] text-white/70">
          Liquidações diferidas de valor líquido acumulado para um beneficiário. Uma liquidação
          concluída é imutável; apenas estados não-terminais podem ser cancelados ou marcados como falhados.
        </p>
      </header>

      <AttentionFilterBar attentionKey="application_settlements" active={attention} onChange={setAttention} />
      <div className="flex flex-wrap items-center gap-2">
        <input className={selClass} placeholder="owner_ref" value={filters.owner_ref ?? ''} onChange={(e) => set('owner_ref', e.target.value)} />
        <select className={selClass} value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">Todos os estados</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabelPt(s)}</option>)}
        </select>
        <select className={selClass} value={filters.business_category ?? ''} onChange={(e) => set('business_category', e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selClass} value={filters.currency ?? ''} onChange={(e) => set('currency', e.target.value)}>
          <option value="">Todas as moedas</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selClass} value={filters.environment ?? ''} onChange={(e) => set('environment', e.target.value)}>
          <option value="">Todos os ambientes</option>
          <option value="LIVE">LIVE</option>
          <option value="SANDBOX">SANDBOX</option>
        </select>
      </div>

      <div className={`grid gap-5 ${selected ? 'grid-cols-1 xl:grid-cols-[1fr_minmax(380px,440px)]' : 'grid-cols-1'}`}>
        <Card>
          <CardHeader title={`Liquidações${view.length ? ` · ${view.length}` : ''}`} />
          {loading ? (
            <div className="adm-skel m-6 h-[220px] rounded-[14px]" />
          ) : error ? (
            <ErrorState message={error} />
          ) : view.length === 0 ? (
            <EmptyMsg title={attention ? 'Nenhuma liquidação requer atenção' : 'Sem liquidações'} hint="Nenhuma liquidação de aplicação para este filtro." />
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#FFF7F6]">
                    <Th>Data</Th>
                    <Th>Owner ref</Th>
                    <Th>Categoria</Th>
                    <Th right>Bruto</Th>
                    <Th right>Taxa app</Th>
                    <Th right>Líquido</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((r) => (
                    <tr key={r.id} onClick={() => { setSelected(r); setSnapOpen(false); }} className="adm-row cursor-pointer transition-colors hover:bg-[#FFF7F6]">
                      <Td>{formatDate(r.created_at)}</Td>
                      <Td className="font-extrabold">{r.owner_ref}</Td>
                      <Td>{r.business_category ?? <span className="text-[#b3a3a7]">—</span>}</Td>
                      <Td right mono>{formatMoney(r.gross_amount.amount_minor, r.gross_amount.currency || r.currency)}</Td>
                      <Td right mono className="text-[#B5101F]">{formatMoney(r.application_fee.amount_minor, r.application_fee.currency || r.currency)}</Td>
                      <Td right mono className="font-extrabold">{formatMoney(r.net_amount.amount_minor, r.net_amount.currency || r.currency)}</Td>
                      <Td><Badge label={statusLabelPt(r.status)} variant={statusVariant(r.status)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {selected && (
          <Card>
            <CardHeader title="Detalhe da liquidação" action={<button title="Fechar" onClick={() => setSelected(null)} className="flex h-[32px] w-[32px] items-center justify-center rounded-[9px] border border-[#f1e3e3] text-[#5a4a4e] hover:bg-[#FFF7F6]"><X size={15} strokeWidth={2.2} /></button>} />
            <div className="flex flex-col gap-[2px] p-[18px]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[15px] font-black">{selected.owner_ref}</span>
                <Badge label={statusLabelPt(selected.status)} variant={statusVariant(selected.status)} />
              </div>
              <Row label="Bruto" value={formatMoney(selected.gross_amount.amount_minor, selected.gross_amount.currency || selected.currency)} />
              <Row label="Taxa da app" value={formatMoney(selected.application_fee.amount_minor, selected.application_fee.currency || selected.currency)} strong />
              <Row label="Líquido" value={formatMoney(selected.net_amount.amount_minor, selected.net_amount.currency || selected.currency)} />
              <Row label="Origem" value={selected.source_account_id} mono />
              <Row label="Beneficiário" value={selected.beneficiary_account_id} mono />
              <Row label="Destino taxa app" value={selected.application_fee_account_id ?? '—'} mono />
              <Row label="Categoria" value={selected.business_category ?? '—'} />
              {/* Same correction as the operator-fees view: an absent rule is
                  an absent DECISION, not a rate of zero. A settlement without a
                  rule id is historical — the engine refuses one now. */}
              <Row
                label="Regra / versão"
                value={selected.pricing_rule_id
                  ? `${selected.pricing_rule_id.slice(0, 8)}… · v${selected.pricing_rule_version}`
                  : 'sem decisão de preço registada'}
              />
              <Row label="Posting líquido" value={selected.settlement_posting_id ?? '—'} mono />
              <Row label="Posting taxa" value={selected.fee_posting_id ?? '—'} mono />
              <Row label="Criado" value={formatDate(selected.created_at)} />
              {selected.completed_at && <Row label="Concluído" value={formatDate(selected.completed_at)} />}
              {selected.cancelled_at && <Row label="Cancelado" value={formatDate(selected.cancelled_at)} />}
              {selected.failed_at && <Row label="Falhado" value={formatDate(selected.failed_at)} />}
              {selected.failure_reason && <Row label="Motivo" value={selected.failure_reason} />}

              <button onClick={() => setSnapOpen((v) => !v)} className="mt-2 flex items-center gap-1 text-[12.5px] font-extrabold text-[#5a4a4e]">
                {snapOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Snapshot de preço
              </button>
              {snapOpen && (
                <pre className="mt-1 max-h-[240px] overflow-auto rounded-[11px] bg-[#1a1416] p-3 font-mono text-[11.5px] leading-[1.5] text-[#e8d8da]">
                  {JSON.stringify(selected.pricing_snapshot_json, null, 2)}
                </pre>
              )}

              {isMutable(selected) ? (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => cancel(selected)} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-[11px] border border-[#f1e3e3] px-[14px] py-[10px] text-[13px] font-extrabold text-[#5a4a4e] hover:bg-[#FFF7F6] disabled:opacity-50">
                    <Ban size={15} strokeWidth={2.4} /> Cancelar
                  </button>
                  <button onClick={() => fail(selected)} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-[#B5101F] px-[14px] py-[10px] text-[13px] font-extrabold text-white hover:bg-[#9a0d1a] disabled:opacity-50">
                    <AlertTriangle size={15} strokeWidth={2.4} /> Falhar
                  </button>
                </div>
              ) : (
                <p className="mt-3 rounded-[11px] bg-[#F5F0F0] px-[13px] py-[10px] text-[12.5px] font-semibold text-[#7a6a6e]">
                  Estado terminal — imutável. Sem ações disponíveis.
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f6eded] py-[8px] last:border-0">
      <span className="text-[12px] font-bold uppercase tracking-[0.03em] text-[#9a8a8e]">{label}</span>
      <span className={`text-right text-[13px] ${mono ? 'font-mono text-[12px]' : ''} ${strong ? 'font-extrabold text-[#B5101F]' : 'font-semibold text-[#2a2024]'} break-all`}>{value}</span>
    </div>
  );
}
