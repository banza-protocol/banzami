'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, X, ChevronDown, ChevronRight } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type OperatorFee, type OperatorFeeFilters } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, CardHeader, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/format';

const CATEGORIES = ['DONATION', 'CROWDFUNDING', 'MARKETPLACE', 'ECOMMERCE', 'DELIVERY', 'FOOD_DELIVERY', 'RIDE_HAILING', 'SUBSCRIPTION', 'TICKETING', 'DIGITAL_GOODS', 'PHYSICAL_GOODS', 'P2P', 'BILL_PAYMENT', 'NGO', 'GOVERNMENT'];
const CURRENCIES = ['AOA', 'USD', 'EUR'];

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const selClass = 'rounded-[11px] border border-[#f1e3e3] bg-white px-[12px] py-[8px] text-[13px] font-semibold text-[#3a2e32] outline-none focus:border-[#B5101F]';

export default function OperatorFeesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<OperatorFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<OperatorFeeFilters>({ environment: 'SANDBOX' });
  const [selected, setSelected] = useState<OperatorFee | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);

  const load = useCallback(async (f: OperatorFeeFilters) => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listOperatorFees(f);
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar as taxas do operador.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters); }, [load, filters]);

  function set<K extends keyof OperatorFeeFilters>(k: K, v: string) {
    setFilters({ ...filters, [k]: v || undefined });
  }

  function exportCsv() {
    if (rows.length === 0) { toast('danger', 'Nada para exportar.'); return; }
    const cols = ['created_at', 'transaction_id', 'business_category', 'pricing_profile', 'currency', 'gross_minor', 'fee_minor', 'net_minor', 'pricing_rule_version', 'engine_version', 'status', 'posting_id'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operator-fees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-[18px] bg-[#1a1416] px-[26px] py-[22px] text-white">
        <h1 className="text-[23px] font-black tracking-[-0.02em]">Taxas do operador</h1>
        <p className="mt-1 max-w-[760px] text-[13.5px] text-white/70">
          Registo imutável de cada taxa do operador aplicada num pagamento. Apenas leitura —
          nunca editado nem apagado. Inclui o snapshot de preço para auditoria interna.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selClass} value={filters.environment ?? ''} onChange={(e) => set('environment', e.target.value)}>
          <option value="">Todos os ambientes</option>
          <option value="LIVE">LIVE</option>
          <option value="SANDBOX">SANDBOX</option>
        </select>
        <select className={selClass} value={filters.business_category ?? ''} onChange={(e) => set('business_category', e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selClass} value={filters.currency ?? ''} onChange={(e) => set('currency', e.target.value)}>
          <option value="">Todas as moedas</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={selClass} placeholder="ID da transação" value={filters.transaction_id ?? ''} onChange={(e) => set('transaction_id', e.target.value)} />
        <input className={selClass} type="date" value={filters.from?.slice(0, 10) ?? ''} onChange={(e) => set('from', e.target.value ? `${e.target.value}T00:00:00Z` : '')} />
        <input className={selClass} type="date" value={filters.to?.slice(0, 10) ?? ''} onChange={(e) => set('to', e.target.value ? `${e.target.value}T23:59:59Z` : '')} />
      </div>

      <div className={`grid gap-5 ${selected ? 'grid-cols-1 xl:grid-cols-[1fr_minmax(360px,420px)]' : 'grid-cols-1'}`}>
        <Card>
          <CardHeader
            title={`Taxas${rows.length ? ` · ${rows.length}` : ''}`}
            action={
              <button onClick={exportCsv} className="flex items-center gap-2 rounded-[11px] border border-[#f1e3e3] px-[13px] py-[8px] text-[13px] font-bold text-[#5a4a4e] hover:bg-[#FFF7F6]">
                <Download size={15} strokeWidth={2.4} /> CSV
              </button>
            }
          />
          {loading ? (
            <div className="adm-skel m-6 h-[220px] rounded-[14px]" />
          ) : error ? (
            <ErrorState message={error} />
          ) : rows.length === 0 ? (
            <EmptyMsg title="Sem taxas" hint="Nenhuma taxa do operador para este filtro." />
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#FFF7F6]">
                    <Th>Data</Th>
                    <Th>Transação</Th>
                    <Th>Categoria</Th>
                    <Th right>Bruto</Th>
                    <Th right>Taxa</Th>
                    <Th right>Líquido</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => { setSelected(r); setSnapOpen(false); }} className="adm-row cursor-pointer transition-colors hover:bg-[#FFF7F6]">
                      <Td>{formatDate(r.created_at)}</Td>
                      <Td mono className="text-[12px]">{r.transaction_id.slice(0, 8)}…</Td>
                      <Td>{r.business_category ?? <span className="text-[#b3a3a7]">—</span>}</Td>
                      <Td right mono>{formatMoney(r.gross_minor, r.currency)}</Td>
                      <Td right mono className="font-extrabold text-[#B5101F]">{formatMoney(r.fee_minor, r.currency)}</Td>
                      <Td right mono>{formatMoney(r.net_minor, r.currency)}</Td>
                      <Td><Badge label={statusLabelPt(r.status)} variant="success" /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {selected && (
          <Card>
            <CardHeader title="Detalhe da taxa" action={<button title="Fechar" onClick={() => setSelected(null)} className="flex h-[32px] w-[32px] items-center justify-center rounded-[9px] border border-[#f1e3e3] text-[#5a4a4e] hover:bg-[#FFF7F6]"><X size={15} strokeWidth={2.2} /></button>} />
            <div className="flex flex-col gap-[2px] p-[18px]">
              <Row label="Bruto" value={formatMoney(selected.gross_minor, selected.currency)} />
              <Row label="Taxa" value={formatMoney(selected.fee_minor, selected.currency)} strong />
              <Row label="Líquido" value={formatMoney(selected.net_minor, selected.currency)} />
              <Row label="Transação" value={selected.transaction_id} mono />
              <Row label="Comerciante" value={selected.merchant_id} mono />
              <Row label="Posting" value={selected.posting_id} mono />
              <Row label="Categoria" value={selected.business_category ?? '—'} />
              <Row label="Perfil" value={selected.pricing_profile ?? '—'} />
              <Row label="Fee policy" value={selected.fee_policy_ref ?? '—'} />
              {/* "sem regra (0)" said that no rule means a fee of zero. It does
                  not: no rule means no pricing decision was recorded, and a
                  capture in that state is now refused rather than charged
                  nothing. A row without a rule id can only be historical, from
                  before that refusal, and must read as an absent decision — not
                  as a rate of zero. An explicit 0-bps rule looks completely
                  different here: it has an id and a version. */}
              <Row
                label="Regra / versão"
                value={selected.pricing_rule_id
                  ? `${selected.pricing_rule_id.slice(0, 8)}… · v${selected.pricing_rule_version}`
                  : 'sem decisão de preço registada'}
              />
              <Row label="Engine" value={`v${selected.engine_version}`} />
              <Row label="Ambiente" value={selected.environment} />
              <Row label="Criado" value={formatDate(selected.created_at)} />
              <button onClick={() => setSnapOpen((v) => !v)} className="mt-2 flex items-center gap-1 text-[12.5px] font-extrabold text-[#5a4a4e]">
                {snapOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Snapshot de preço
              </button>
              {snapOpen && (
                <pre className="mt-1 max-h-[260px] overflow-auto rounded-[11px] bg-[#1a1416] p-3 font-mono text-[11.5px] leading-[1.5] text-[#e8d8da]">
                  {JSON.stringify(selected.snapshot_json, null, 2)}
                </pre>
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
