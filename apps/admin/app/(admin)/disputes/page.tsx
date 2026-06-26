'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, type AdminDispute } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/components/ui/dialog';
import { formatKz } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

const RESOLVED = ['RESOLVED', 'CLOSED'];

export default function DisputesPage() {
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

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

  async function resolve(d: AdminDispute) {
    const api = getApi();
    if (!api) return;
    const outcome = await dialog.prompt({
      title: 'Resolver disputa',
      label: 'Resultado',
      placeholder: 'Ex.: MERCHANT_FAVOR ou CONSUMER_FAVOR',
      confirmLabel: 'Continuar',
      required: true,
    });
    if (!outcome || !outcome.trim()) return;
    const notes = (await dialog.prompt({ title: 'Resolver disputa', label: 'Notas de resolução (opcional)', multiline: true, confirmLabel: 'Continuar' })) ?? '';
    const okGo = await dialog.confirm({
      title: 'Resolver disputa',
      message: `Resolver a disputa ${d.id.slice(0, 10)} com o resultado "${outcome.trim()}"? Esta ação é definitiva e fica registada no log de auditoria.`,
      confirmLabel: 'Resolver',
      danger: true,
    });
    if (!okGo) return;
    setBusy(d.id);
    try {
      await api.resolveDispute(d.id, outcome.trim(), notes);
      toast('success', 'Disputa resolvida.');
      await load();
    } catch {
      toast('danger', 'Não foi possível resolver a disputa.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Card><div className="adm-skel m-6 h-[200px] rounded-[14px]" /></Card>;
  if (error) return <Card><ErrorState message={error} /></Card>;
  if (rows.length === 0) return <Card><EmptyMsg title="Ainda não há disputas." /></Card>;

  return (
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
        {rows.map((d) => {
          const resolved = RESOLVED.includes(d.status.toUpperCase());
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
              <Td><Badge label={statusLabelPt(d.status)} /></Td>
              <Td right>
                {resolved ? (
                  <span className="text-[13px] font-bold text-[#1f9d57]">✓ Resolvida</span>
                ) : (
                  <button
                    onClick={() => resolve(d)}
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
  );
}
