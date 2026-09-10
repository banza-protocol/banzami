'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import { AdminApi, type Merchant } from '@/lib/admin-api';
import { Badge, statusLabelPt } from '@/components/ui/badge';
import { ErrorState, TableWrap, Th, Td } from '@/components/ui/table';
import { accountTypeLabel, initials } from '@/lib/format';

/**
 * Every Business, by the @handle it owns — whether an application, a
 * consolidation or an operator created it. Applications are a separate list
 * (Candidaturas): an application is a request, a Business is the institution.
 */
export default function BusinessesPage() {
  const router = useRouter();
  const [api] = useState<AdminApi | null>(() => {
    const s = getSession();
    return s ? new AdminApi(s.token) : null;
  });
  const [rows, setRows] = useState<Merchant[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);

  useEffect(() => {
    if (!api) return;
    void (async () => {
      try {
        setRows((await api.listMerchants()).data ?? []);
      } catch {
        setError(true);
      }
    })();
  }, [api]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    return (rows ?? [])
      .filter((m) => !onlyActive || m.status === 'ACTIVE')
      .filter((m) => !needle || (m.handle ?? '').includes(needle) || m.name.toLowerCase().includes(needle) || m.id.startsWith(needle))
      .sort((a, b) => Number(!a.handle) - Number(!b.handle) || (a.handle ?? a.name).localeCompare(b.handle ?? b.name));
  }, [rows, q, onlyActive]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-black tracking-[-0.02em]">Negócios</h1>
          <p className="m-0 mt-1 text-[14px] font-semibold text-[#9a8a8e]">
            Cada Business Account pelo @handle que possui — KYB, classe, carteira, projetos e candidaturas numa só página.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] font-extrabold text-[#7a6a6e]">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Só ativos
          </label>
          <input
            aria-label="Procurar por @handle, nome ou id"
            placeholder="@handle, nome ou id"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-[12px] border-[1.5px] border-[#f1e3e3] bg-white px-4 py-2.5 text-[14px] font-semibold outline-none focus:border-[#B5101F]"
          />
        </div>
      </div>
      {error ? (
        <ErrorState message="Não foi possível carregar as Business Accounts." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Business</Th>
              <Th>Classe</Th>
              <Th>Verificação</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {view.map((m) => (
              <tr key={m.id} onClick={() => router.push(`/businesses/${m.id}`)} className="adm-row cursor-pointer transition-colors">
                <Td>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[#FFF1F0] text-[13px] font-extrabold text-[#B5101F]">
                      {initials(m.name)}
                    </span>
                    <div>
                      <div className="font-mono text-[14px] font-extrabold text-[#B5101F]">{m.handle ? `@${m.handle}` : 'sem @handle'}</div>
                      <div className="text-[12.5px] font-semibold text-[#7a6a6e]">{m.name} · {m.id.slice(0, 8)}…</div>
                    </div>
                  </div>
                </Td>
                <Td className="font-semibold text-[#5a4a4e]">{accountTypeLabel(m.business_account_type)}</Td>
                <Td className="font-semibold text-[#5a4a4e]">{m.verified ? 'KYB aprovado' : 'Não verificado'}</Td>
                <Td><Badge label={statusLabelPt(m.status)} /></Td>
                <Td right><span className="text-[13px] font-extrabold text-[#B5101F]">Abrir →</span></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
