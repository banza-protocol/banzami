'use client';

// BANZADMIN — mobile beta testers (APP-BETA-001).
//
// The public site registers prospective testers; here the operator reads the
// queue, filters and searches it, opens a tester to see everything they sent,
// advances them through the lifecycle (mark invited / active / removed, with an
// optional note), and exports the current view as CSV. It is contact detail,
// not money: no balances, no financial action, no environment switch (the
// registry is global). Invitations to TestFlight / Google Play testing are sent
// by hand in those consoles; a status change here only records that the
// operator did so.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Search, X, Copy, Check, Mail, Smartphone, Globe, Cpu, Compass } from 'lucide-react';
import { getSession } from '@/lib/session';
import { AdminApi, type BetaTester, type BetaTesterFilter } from '@/lib/admin-api';
import { useDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { Card, TableWrap, Th, Td, EmptyMsg, ErrorState } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateTime, initials } from '@/lib/format';

// Plain-language lifecycle. The API codes are unchanged; only the words the
// operator reads are intuitive: a tester is registered (Pendente), added to the
// tests (INVITED → "Adicionado"), confirmed testing (ACTIVE → "A testar"), or
// dropped (Removido).
const STATUS_PT: Record<BetaTester['status'], string> = {
  PENDING: 'Pendente',
  INVITED: 'Adicionado',
  ACTIVE: 'A testar',
  REMOVED: 'Removido',
};

// Explicit badge colours so the friendlier labels keep their meaning (the Badge
// component maps by text, which our custom words would not match).
const STATUS_VARIANT: Record<BetaTester['status'], 'warning' | 'info' | 'success' | 'neutral'> = {
  PENDING: 'warning',
  INVITED: 'info',
  ACTIVE: 'success',
  REMOVED: 'neutral',
};

// The verb on each transition button — what the operator is recording.
const VERB_ADD = 'Adicionar aos testes';
const VERB_TESTING = 'Confirmar a testar';
const VERB_REMOVE = 'Remover';

type StatusFilter = '' | BetaTester['status'];
type AppFilter = '' | 'APP_BANZAMI' | 'APP_MERCHANT';
type PlatformFilter = '' | 'IOS' | 'ANDROID';
type NextStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';

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
  if (t.app_merchant) a.push('App Banzami Business');
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
  const [detail, setDetail] = useState<BetaTester | null>(null);

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

  // Returns true when the change was applied, so a caller (e.g. the detail
  // modal) can react. Updates the open detail in place with the fresh record.
  async function act(t: BetaTester, next: NextStatus, verb: string): Promise<boolean> {
    const api = getApi();
    if (!api) return false;
    const note = await dialog.prompt({
      title: `${verb} — ${t.first_name} ${t.last_name}`,
      label: 'Nota do operador (opcional)',
      placeholder: 'ex.: adicionado ao TestFlight a 15/09',
      multiline: true,
      required: false,
      confirmLabel: verb,
    });
    if (note === null) return false; // cancelled
    try {
      const updated = await api.setBetaTesterStatus(t.id, next, note.trim() || undefined);
      toast('success', `${t.first_name}: ${STATUS_PT[next].toLowerCase()}.`);
      setDetail((d) => (d && d.id === t.id ? updated : d));
      void load();
      return true;
    } catch {
      toast('danger', 'Não foi possível atualizar o estado.');
      return false;
    }
  }

  function actionsFor(t: BetaTester) {
    const btn = 'rounded-[10px] px-2.5 py-1 text-[12px] font-extrabold transition';
    const items: React.ReactNode[] = [];
    if (t.status === 'PENDING' || t.status === 'REMOVED') {
      items.push(
        <button key="inv" onClick={() => act(t, 'INVITED', VERB_ADD)} className={`${btn} bg-[#e9effb] text-[#3a5bd0] hover:brightness-95`}>
          {VERB_ADD}
        </button>,
      );
    }
    if (t.status === 'INVITED') {
      items.push(
        <button key="act" onClick={() => act(t, 'ACTIVE', VERB_TESTING)} className={`${btn} bg-[#eafaf0] text-[#1f9d57] hover:brightness-95`}>
          {VERB_TESTING}
        </button>,
      );
    }
    if (t.status !== 'REMOVED') {
      items.push(
        <button key="rem" onClick={() => act(t, 'REMOVED', VERB_REMOVE)} className={`${btn} bg-[#FFF1F0] text-[#B5101F] hover:brightness-95`}>
          {VERB_REMOVE}
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
            {([['', 'Todos'], ['PENDING', 'Pendentes'], ['INVITED', 'Adicionados'], ['ACTIVE', 'A testar'], ['REMOVED', 'Removidos']] as [StatusFilter, string][]).map(
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
            <option value="APP_MERCHANT">App Banzami Business</option>
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
                <tr
                  key={t.id}
                  className="adm-row cursor-pointer transition-colors"
                  onClick={() => setDetail(t)}
                  title="Ver detalhes"
                >
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
                  <Td><Badge label={STATUS_PT[t.status]} variant={STATUS_VARIANT[t.status]} /></Td>
                  <Td mono className="font-semibold text-[#5a4a4e]">{formatDate(t.created_at)}</Td>
                  {/* Stop row-open when clicking an action button. */}
                  <Td right>
                    <div onClick={(e) => e.stopPropagation()}>{actionsFor(t)}</div>
                  </Td>
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

      {detail && (
        <BetaTesterDetail
          tester={detail}
          onClose={() => setDetail(null)}
          onAct={act}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail modal — everything the tester sent, the lifecycle timeline, and the
// same actions as the row (explained), so the operator can record that they
// were added to the tests instead of leaving them "Pendente" forever.
// ---------------------------------------------------------------------------

function BetaTesterDetail({
  tester,
  onClose,
  onAct,
}: {
  tester: BetaTester;
  onClose: () => void;
  onAct: (t: BetaTester, next: NextStatus, verb: string) => Promise<boolean>;
}) {
  const [copied, setCopied] = useState<'' | 'email' | 'all'>('');

  const t = tester;

  async function copy(text: string, which: 'email' | 'all') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  // A plain-text block of everything present, for pasting into an invite email
  // or the TestFlight/Play console.
  function allText(): string {
    const lines: string[] = [
      `Nome: ${t.first_name} ${t.last_name}`,
      `E-mail: ${t.email}`,
      `Apps: ${appsLabel(t)}`,
      `Plataforma: ${platformLabel(t)}`,
    ];
    if (t.device_model) lines.push(`Dispositivo: ${t.device_model}`);
    if (t.os_version) lines.push(`Versão do SO: ${t.os_version}`);
    if (t.country) lines.push(`País: ${t.country}`);
    if (t.source) lines.push(`Origem: ${t.source}`);
    return lines.join('\n');
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-[20px] border border-[#f1e3e3] bg-white shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#f4eaea] p-6">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[#1a1416] text-[15px] font-extrabold text-white">
              {initials(`${t.first_name} ${t.last_name}`)}
            </span>
            <div>
              <div className="text-[18px] font-black tracking-[-0.01em]">{t.first_name} {t.last_name}</div>
              <div className="mt-1"><Badge label={STATUS_PT[t.status]} variant={STATUS_VARIANT[t.status]} /></div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-[#9a8a8e] hover:text-[#2a2024]">
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {/* Contact — copy the e-mail, or copy every field as a text block. */}
          <div className="space-y-2">
            <button
              onClick={() => copy(t.email, 'email')}
              className="group flex w-full items-center gap-3 rounded-[14px] border border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-left transition hover:border-[#e6cfcf]"
              title="Copiar e-mail"
            >
              <Mail size={17} className="flex-none text-[#B5101F]" />
              <span className="flex-1 truncate text-[14px] font-bold text-[#2a2024]">{t.email}</span>
              {copied === 'email' ? <Check size={16} className="text-[#1f9d57]" /> : <Copy size={16} className="text-[#b0a0a4] group-hover:text-[#5a4a4e]" />}
            </button>
            <button
              onClick={() => copy(allText(), 'all')}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-[#5a4a4e] transition hover:text-[#B5101F]"
            >
              {copied === 'all' ? <Check size={14} className="text-[#1f9d57]" /> : <Copy size={14} />}
              {copied === 'all' ? 'Copiado' : 'Copiar todos os dados'}
            </button>
          </div>

          {/* Facts grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Fact icon={<Smartphone size={15} />} label="Apps que quer testar" value={appsLabel(t)} />
            <Fact icon={<Smartphone size={15} />} label="Plataforma" value={platformLabel(t)} />
            {t.device_model && <Fact icon={<Cpu size={15} />} label="Dispositivo" value={t.device_model} />}
            {t.os_version && <Fact icon={<Cpu size={15} />} label="Versão do SO" value={t.os_version} />}
            {t.country && <Fact icon={<Globe size={15} />} label="País" value={t.country} />}
            {t.source && <Fact icon={<Compass size={15} />} label="Origem" value={t.source} />}
          </div>

          {/* Timeline */}
          <div className="rounded-[14px] border border-[#f1e3e3] p-4">
            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#9a8a8e]">Histórico</div>
            <div className="space-y-2.5">
              <TimelineRow label="Inscrito" at={t.created_at} on />
              <TimelineRow label="Adicionado aos testes" at={t.invited_at} on={!!t.invited_at} />
              <TimelineRow label="A testar" at={t.activated_at} on={!!t.activated_at} />
              {t.removed_at && <TimelineRow label="Removido" at={t.removed_at} on danger />}
            </div>
          </div>

          {/* Note */}
          {t.note && (
            <div className="rounded-[14px] border border-[#f1e3e3] bg-[#FFF7F6] p-4">
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#9a8a8e]">Nota do operador</div>
              <p className="m-0 whitespace-pre-wrap text-[14px] font-semibold leading-[1.55] text-[#5a4a4e]">{t.note}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-[#f4eaea] p-6">
          {t.status === 'PENDING' && (
            <p className="mb-3 text-[13px] font-semibold leading-[1.5] text-[#7a6a6e]">
              Depois de adicionar esta pessoa ao TestFlight (iOS) ou ao Google Play testing (Android), marca-a como
              <b> adicionada aos testes</b> para não ficar pendente. Quando confirmares que já instalou e está mesmo a testar, marca <b>a testar</b>.
            </p>
          )}
          {t.status === 'INVITED' && (
            <p className="mb-3 text-[13px] font-semibold leading-[1.5] text-[#7a6a6e]">
              Já foi adicionada aos testes{t.invited_at ? ` (${formatDate(t.invited_at)})` : ''}. Quando confirmares que já instalou e está a testar, marca <b>a testar</b>.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2.5">
            {(t.status === 'PENDING' || t.status === 'REMOVED') && (
              <button
                onClick={() => onAct(t, 'INVITED', VERB_ADD)}
                className="rounded-[12px] bg-[#e9effb] px-4 py-2.5 text-[13.5px] font-extrabold text-[#3a5bd0] transition hover:brightness-95"
              >
                {VERB_ADD}
              </button>
            )}
            {t.status === 'INVITED' && (
              <button
                onClick={() => onAct(t, 'ACTIVE', VERB_TESTING)}
                className="rounded-[12px] bg-[#eafaf0] px-4 py-2.5 text-[13.5px] font-extrabold text-[#1f9d57] transition hover:brightness-95"
              >
                {VERB_TESTING}
              </button>
            )}
            {t.status !== 'REMOVED' && (
              <button
                onClick={() => onAct(t, 'REMOVED', VERB_REMOVE)}
                className="rounded-[12px] bg-[#FFF1F0] px-4 py-2.5 text-[13.5px] font-extrabold text-[#B5101F] transition hover:brightness-95"
              >
                {VERB_REMOVE}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-[12px] border-[1.5px] border-[#f1e3e3] bg-white px-4 py-2.5 text-[13.5px] font-extrabold text-[#5a4a4e] transition hover:bg-[#FFF7F6]"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#9a8a8e]">
        <span className="text-[#c0aeb2]">{icon}</span>
        {label}
      </div>
      <div className="text-[14px] font-bold text-[#2a2024]">{value}</div>
    </div>
  );
}

function TimelineRow({ label, at, on, danger }: { label: string; at?: string | null; on: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-2 w-2 flex-none rounded-full"
        style={{ background: on ? (danger ? '#B5101F' : '#1f9d57') : '#e4d7d7' }}
      />
      <span className={`flex-1 text-[13px] font-bold ${on ? 'text-[#2a2024]' : 'text-[#b0a0a4]'}`}>{label}</span>
      <span className="text-[12.5px] font-semibold text-[#9a8a8e]">{at ? formatDateTime(at) : '—'}</span>
    </div>
  );
}
