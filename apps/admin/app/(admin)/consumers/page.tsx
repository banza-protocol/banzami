'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSession } from '@/lib/session';
import { AdminApi, type Consumer } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { formatDate, initials, withAt } from '@/lib/format';

function getApi(): AdminApi | null {
  const s = getSession();
  return s ? new AdminApi(s.token) : null;
}

export default function ConsumersPage() {
  const [rows, setRows] = useState<Consumer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listConsumers();
      setRows(r.data);
    } catch {
      setError('Não foi possível carregar os consumidores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Card><div className="adm-skel m-6 h-[200px] rounded-[14px]" /></Card>;
  if (error) return <Card><ErrorState message={error} /></Card>;
  if (rows.length === 0) return <Card><EmptyMsg title="Ainda não há consumidores." /></Card>;

  return (
    <TableWrap>
      <thead>
        <tr className="bg-[#FFF7F6]">
          <Th>Consumidor</Th>
          <Th>Estado</Th>
          <Th>Verificação</Th>
          <Th>Desde</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="adm-row transition-colors">
            <Td>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#1a1416] text-[12px] font-extrabold text-white">
                  {initials(c.display_name || c.handle)}
                </span>
                <div>
                  <div className="text-[14px] font-extrabold">{c.display_name || '—'}</div>
                  <div className="font-mono text-[12px] font-semibold text-[#9a8a8e]">{withAt(c.handle)}</div>
                </div>
              </div>
            </Td>
            <Td><Badge label={statusLabelPt(c.status)} /></Td>
            <Td className="font-semibold text-[#5a4a4e]">{c.verification_badge ?? '—'}</Td>
            <Td mono className="font-semibold text-[#5a4a4e]">{formatDate(c.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
