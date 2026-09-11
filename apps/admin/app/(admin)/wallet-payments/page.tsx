'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, type WalletPayment } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { businessLabel, formatMoney, formatDate } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

// "Pagamentos recebidos" — wallet-native merchant payments (canonical:
// wallet_payments), distinct from /payments (payouts). Official receipt PDF via
// the Document Engine.
//
// "Negócio" is the Business as its receipts name it (@handle · public name),
// not the raw account name. "Referência" is the operation's existing proof —
// the same one on the payer's and the Business's receipts — shown in full as
// on the Comprovativos page, or "—" when no proof was issued. The console
// never derives one.
export default function WalletPaymentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<WalletPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [environment, setEnvironment] = useState('SANDBOX');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listWalletPayments({
        limit: 100,
        status: status || undefined,
        environment: environment || undefined,
      });
      setRows(r.items);
    } catch {
      setError('Não foi possível carregar os pagamentos recebidos.');
    } finally {
      setLoading(false);
    }
  }, [status, environment]);

  useEffect(() => { void load(); }, [load]);

  async function openReceipt(p: WalletPayment) {
    const api = getApi();
    if (!api) return;
    setBusy(p.id);
    try {
      const blob = await api.fetchReceiptPdf(p.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast('danger', 'Não foi possível obter o comprovativo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-black tracking-[-0.02em] text-[#231F20]">Pagamentos recebidos</h1>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-[10px] border border-[#f1e6e6] bg-white px-3 py-2 text-[13px] font-bold text-[#5a4a4e]"
          >
            <option value="">Todos os estados</option>
            <option value="COMPLETED">Confirmado</option>
            <option value="PENDING">Pendente</option>
            <option value="FAILED">Falhado</option>
            <option value="REVERSED">Revertido</option>
          </select>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className="rounded-[10px] border border-[#f1e6e6] bg-white px-3 py-2 text-[13px] font-bold text-[#5a4a4e]"
          >
            <option value="">Todos os ambientes</option>
            <option value="LIVE">Produção</option>
            <option value="SANDBOX">Sandbox</option>
          </select>
        </div>
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} />
        ) : loading ? (
          <EmptyMsg title="A carregar…" />
        ) : rows.length === 0 ? (
          <EmptyMsg title="Sem pagamentos recebidos" hint="Os pagamentos wallet-native aparecerão aqui." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Referência</Th>
                <Th>Negócio</Th>
                <Th>Pagador</Th>
                <Th right>Valor</Th>
                <Th>Estado</Th>
                <Th>Ambiente</Th>
                <Th>Data</Th>
                <Th right>Comprovativo</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="adm-row transition-colors">
                  <Td mono className="font-extrabold text-[#B5101F]">
                    {p.proof_reference || <span className="font-semibold text-[#b09a9e]" title="Ainda não foi emitido comprovativo para esta operação.">—</span>}
                  </Td>
                  <Td className="font-semibold text-[#231F20]">
                    <span title={p.merchant_name ? `Conta: ${p.merchant_name}` : undefined}>
                      {businessLabel(p.payee_handle, p.payee_display_name, p.merchant_name || p.merchant_id.slice(0, 8))}
                    </span>
                  </Td>
                  <Td className="text-[#5a4a4e]">{p.payer_name || '—'}</Td>
                  <Td right mono className="font-extrabold">{formatMoney(p.amount_minor, p.currency)}</Td>
                  <Td><Badge label={statusLabelPt(p.status)} /></Td>
                  <Td mono className="text-[#9a8a8e]">{p.environment}</Td>
                  <Td className="text-[#9a8a8e]">{formatDate(p.created_at)}</Td>
                  <Td right>
                    {p.receipt_available ? (
                      <button
                        onClick={() => openReceipt(p)}
                        disabled={busy === p.id}
                        className="rounded-[10px] border border-[#f1d4d4] px-3 py-1.5 text-[13px] font-extrabold text-[#B5101F] transition-colors hover:bg-[#FFF1F0] disabled:opacity-50"
                      >
                        {busy === p.id ? '…' : 'Comprovativo'}
                      </button>
                    ) : (
                      <span className="text-[13px] text-[#b09a9e]">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
