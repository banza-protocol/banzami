'use client';

// BANZADMIN — mobile beta testers (APP-BETA-001).
//
// The public site registers prospective testers; here the operator reads the
// queue, filters and searches it, advances a tester through the lifecycle
// (mark invited / active / removed, with an optional note), and exports the
// current view as CSV. It is contact detail, not money: no balances, no
// financial action, no environment switch (the registry is global). Invitations
// to TestFlight / Google Play testing are sent by hand in those consoles; a
// status change here only records that the operator did so.

import { useCallback, useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type BetaTester, type BetaTesterFilter } from '@/lib/admin-api';
import { useDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate, initials } from '@/lib/format';

const STATUS_PT: Record<BetaTester['status'], string> = {
  PENDING: 'Pendente',
  INVITED: 'Convidado',
  ACTIVE: 'Ativo',
  REMOVED: 'Removido',
};

type StatusFilter = '' | BetaTester['status'];
type AppFilter = '' | 'APP_BANZAMI' | 'APP_MERCHANT';
type PlatformFilter = '' | 'IOS' | 'ANDROID';

const PAGE_SIZE = 50;

function getApi(): AdminApi | null {
  return getSession() ? new AdminApi() : null;
}

function platformLabel(t: BetaTester): string {
  if (t.wants_ios && t.wants_android) return 'iOS + Android';
  if (t.wants_ios) return 'iOS';
  if (t.wants_android) return 'Android';
  return '—';
}

function appsLabel(t: BetaTester): string {
  const a: string[] = [];
  if (t.app_banzami) a.push('App Banzami');
  if (t.app_merchant) a.push('App Comerciante');
  return a.join(' + ') || '—';
}

export default function BetaTestersPage() {
  const dialog = useDialog();
  const toast = useToast();

  const [rows, setRows] = useState<BetaTester[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState<StatusFilter>('');
  const [app, setApp] = useState<AppFilter>('');
  const [platform, setPlatform] = useState<PlatformFilter>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // debounced/applied search
  const [offset, setOffset] = useState(0);

  const filter: BetaTesterFilter = {
    status: status || undefined,
    app: app || undefined,
    platform: platform || undefined,
    q: query || undefined,
    limit: PAGE_SIZE,
    offset,
  };

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.listBetaTesters(filter);
      setRows(r.testers ?? []);
      setTotal(r.total ?? 0);
    } catch {
      setError('Não foi possível carregar os beta testers.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, app, platform, query, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filters reset the page to the first.
  useEffect(() => {
    setOffset(0);
  }, [status, app, platform, query]);

  async function act(t: BetaTester, next: 'INVITED' | 'ACTIVE' | 'REMOVED', verb: string) {
    const api = getApi();
    if (!api) return;
    const note = await dialog.prompt({
      title: `${verb} — ${t.first_name} ${t.last_name}`,
      label: 'Nota do operador (opcional)',
      placeholder: 'ex.: convidado no TestFlight a 15/09',
      multiline: true,
      required: false,
      confirmLabel: verb,
    });
    if (note === null) return; // cancelled
    try {
      await api.setBetaTesterStatus(t.id, next, note.trim() || undefined);
      toast('success', `${t.first_name}: ${STATUS_PT[next].toLowerCase()}.`);
      void load();
    } catch {
      toast('danger', 'Não foi possível atualizar o estado.');
    }
  }

  function actionsFor(t: BetaTester) {
    const btn = 'rounded-[10px] px-2.5 py-1 text-[12px] font-extrabold transition';
    const items: React.ReactNode[] = [];
    if (t.status === 'PENDING' || t.status === 'REMOVED') {
      items.push(
        <button key="inv" onClick={() => act(t, 'INVITED', 'Marcar convidado')} className={`${btn} bg-[#e9effb] text-[#3a5bd0] hover:brightness-95`}>
          Marcar convidado
        </button>,
      );
    }
    if (t.status === 'INVITED') {
      items.push(
        <button key="act" onClick={() => act(t, 'ACTIVE', 'Marcar ativo')} className={`${btn} bg-[#eafaf0] text-[#1f9d57] hover:brightness-95`}>
          Marcar ativo
        </button>,
      );
    }
    if (t.status !== 'REMOVED') {
      items.push(
        <button key="rem" onClick={() => act(t, 'REMOVED', 'Remover')} className={`${btn} bg-[#FFF1F0] text-[#B5101F] hover:brightness-95`}>
          Remover
        </button>,
      );
    }
    return <div className="flex flex-wrap justify-end gap-1.5">{items}</div>;
  }

  const exportUrl = getApi()?.betaExportUrl({ status: status || undefined, app: app || undefined, platform: platform || undefined, q: query || undefined }) ?? '#';
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pill = (active: boolean) =>
    `rounded-[10px] px-3 py-1.5 text-[12.5px] font-extrabold transition ${active ? 'bg-[#1a1416] text-white' : 'bg-[#f6efef] text-[#7a6a6e] hover:bg-[#efe6e6]'}`;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {([['', 'Todos'], ['PENDING', 'Pendentes'], ['INVITED', 'Convidados'], ['ACTIVE', 'Ativos'], ['REMOVED', 'Removidos']] as [StatusFilter, string][]).map(
              ([v, lbl]) => (
                <button key={v || 'all'} onClick={() => setStatus(v)} className={pill(status === v)}>
                  {lbl}
                </button>
              ),
            )}
          </div>
          <span className="mx-1 h-5 w-px bg-[#eadede]" />
          <select value={app} onChange={(e) => setApp(e.target.value as AppFilter)} className="rounded-[10px] border border-[#eadede] bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-[#5a4a4e]">
            <option value="">Todas as apps</option>
            <option value="APP_BANZAMI">App Banzami</option>
            <option value="APP_MERCHANT">App Comerciante</option>
          </select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as PlatformFilter)} className="rounded-[10px] border border-[#eadede] bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-[#5a4a4e]">
            <option value="">Todas as plataformas</option>
            <option value="IOS">iOS</option>
            <option value="ANDROID">Android</option>
          </select>

          <form
            className="relative ml-auto flex items-center"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
            }}
          >
            <Search size={15} className="pointer-events-none absolute left-3 text-[#b0a0a4]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou e-mail"
              className="w-[220px] rounded-[10px] border border-[#eadede] bg-white py-1.5 pl-9 pr-3 text-[13px] font-semibold text-[#2a2024] outline-none focus:border-[#B5101F]"
            />
          </form>
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#1a1416] px-3 py-1.5 text-[12.5px] font-extrabold text-white transition hover:brightness-110"
          >
            <Download size={14} /> CSV
          </a>
        </div>
      </Card>

      {loading ? (
        <Card><div className="adm-skel m-6 h-[220px] rounded-[14px]" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyMsg title="Nenhum beta tester corresponde." hint="Ajuste os filtros ou a pesquisa." /></Card>
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr className="bg-[#FFF7F6]">
                <Th>Tester</Th>
                <Th>App</Th>
                <Th>Plataforma</Th>
                <Th>Estado</Th>
                <Th>Inscrito</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="adm-row transition-colors">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#1a1416] text-[12px] font-extrabold text-white">
                        {initials(`${t.first_name} ${t.last_name}`)}
                      </span>
                      <div>
                        <div className="text-[14px] font-extrabold">{t.first_name} {t.last_name}</div>
                        <div className="text-[12px] font-semibold text-[#9a8a8e]">{t.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-semibold text-[#5a4a4e]">{appsLabel(t)}</Td>
                  <Td className="font-semibold text-[#5a4a4e]">{platformLabel(t)}</Td>
                  <Td><Badge label={STATUS_PT[t.status]} /></Td>
                  <Td mono className="font-semibold text-[#5a4a4e]">{formatDate(t.created_at)}</Td>
                  <Td right>{actionsFor(t)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <div className="flex items-center justify-between px-1 text-[12.5px] font-semibold text-[#7a6a6e]">
            <span>{total} {total === 1 ? 'tester' : 'testers'}</span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded-[8px] px-2.5 py-1 font-extrabold text-[#5a4a4e] disabled:opacity-40 hover:bg-[#f6efef]">
                  Anterior
                </button>
                <span>Página {page} de {pageCount}</span>
                <button disabled={page >= pageCount} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded-[8px] px-2.5 py-1 font-extrabold text-[#5a4a4e] disabled:opacity-40 hover:bg-[#f6efef]">
                  Seguinte
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
