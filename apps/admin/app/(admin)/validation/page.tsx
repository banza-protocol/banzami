'use client';

/**
 * BANZADMIN — Banzami Validation Studio.
 *
 * The canonical OPERATIONAL surface (doc 23: one engine, multiple control
 * surfaces). This page is a control surface and nothing more: every decision it
 * shows — which suites a profile covers, how much a run may spend, whether the
 * Sandbox is fit — is computed by admin-api from registries reviewed as code.
 * Nothing here is a source of truth, and nothing here executes a journey.
 *
 * It also cannot start a run, because no route exists that could.
 */

import { useCallback, useEffect, useState } from 'react';
import { Microscope, ShieldCheck, AlertTriangle, CircleSlash, Ban } from 'lucide-react';
import { getSession } from '@/lib/session';
import {
  AdminApi,
  type ValidationOverview, type ValidationActor, type ValidationProfile,
  type ValidationPreflight, type ValidationRun, type ValidationCheck,
} from '@/lib/admin-api';
import { Card, CardHeader, ErrorState } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { formatKz, formatDateTime, timeAgo } from '@/lib/format';

function getApi(): AdminApi | null {
  return getSession() ? new AdminApi() : null;
}

type Tab = 'overview' | 'actors' | 'profiles' | 'preflight' | 'runs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'actors',   label: 'Actores' },
  { id: 'profiles', label: 'Perfis' },
  { id: 'preflight', label: 'Verificação prévia' },
  { id: 'runs',     label: 'Execuções' },
];

const VERDICT_STYLE: Record<string, string> = {
  HEALTHY:   'border-green-300 bg-green-50 text-green-800',
  DEGRADED:  'border-amber-300 bg-amber-50 text-amber-900',
  UNHEALTHY: 'border-red-300 bg-red-50 text-red-800',
};

const CHECK_STYLE: Record<ValidationCheck['status'], string> = {
  PASS:        'bg-green-100 text-green-800',
  WARN:        'bg-amber-100 text-amber-900',
  FAIL:        'bg-red-100 text-red-800',
  SKIPPED:     'bg-neutral-100 text-neutral-600',
  UNAVAILABLE: 'bg-neutral-200 text-neutral-700',
};

const STATE_STYLE: Record<string, string> = {
  PREPARING: 'bg-neutral-100 text-neutral-700',
  PREFLIGHT_RUNNING: 'bg-blue-100 text-blue-800',
  BLOCKED: 'bg-red-100 text-red-800',
  READY: 'bg-green-100 text-green-800',
  QUEUED: 'bg-blue-100 text-blue-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-neutral-200 text-neutral-700',
  ABANDONED: 'bg-amber-100 text-amber-900',
};

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

export default function ValidationStudioPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');

  const [overview, setOverview] = useState<ValidationOverview | null>(null);
  const [actors, setActors] = useState<ValidationActor[] | null>(null);
  const [profiles, setProfiles] = useState<ValidationProfile[] | null>(null);
  const [preflight, setPreflight] = useState<ValidationPreflight | null>(null);
  const [preflightFor, setPreflightFor] = useState<string>('GOLDEN');
  const [meetsMinimum, setMeetsMinimum] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<ValidationRun[] | null>(null);
  const [busy, setBusy] = useState(false);

  const canPrepare = (() => {
    const role = getSession()?.user.role;
    return role === 'SUPER_ADMIN' || role === 'OPERATIONS';
  })();

  const load = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setError('');
    try {
      const [o, a, p, r] = await Promise.all([
        api.validationOverview(),
        api.validationActors(),
        api.validationProfiles(),
        api.validationRuns(),
      ]);
      setOverview(o);
      setActors(a.actors);
      setProfiles(p.profiles);
      setRuns(r.runs);
    } catch {
      setError('Não foi possível carregar o Validation Studio.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runPreflight = useCallback(async (profile: string) => {
    const api = getApi();
    if (!api) return;
    setBusy(true);
    try {
      const res = await api.validationPreflight(profile);
      setPreflight(res.preflight);
      setMeetsMinimum(res.meets_minimum ?? null);
      setPreflightFor(profile);
      setTab('preflight');
    } catch {
      toast('danger', 'Não foi possível executar a verificação prévia.');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const prepareRun = useCallback(async (profile: string) => {
    const api = getApi();
    if (!api) return;
    setBusy(true);
    try {
      // The key makes preparation replayable: two operators clicking at once is
      // the ordinary case, and the second click must not take a second slot.
      const key = `${profile}-${new Date().toISOString().slice(0, 16)}`;
      const res = await api.validationPrepareRun(profile, key);
      toast(
        res.run.state === 'READY' ? 'success' : 'warning',
        `${res.run.run_ref} preparada (${res.run.state}). ${res.note}`,
      );
      setPreflight(res.preflight);
      setPreflightFor(profile);
      await load();
      setTab('runs');
    } catch {
      toast('danger', 'Não foi possível preparar a execução.');
    } finally {
      setBusy(false);
    }
  }, [toast, load]);

  const cancelRun = useCallback(async (run: ValidationRun) => {
    const api = getApi();
    if (!api) return;
    setBusy(true);
    try {
      await api.validationCancelRun(run.id, 'cancelada pelo operador no BANZADMIN');
      toast('success', `${run.run_ref} cancelada.`);
      await load();
    } catch {
      toast('danger', 'Não foi possível cancelar a execução.');
    } finally {
      setBusy(false);
    }
  }, [toast, load]);

  return (
    <div className="p-[26px]">
      <div className="mb-[22px] border-b border-[#f1e3e3]">
        <h1 className="flex items-center gap-2 pb-[14px] text-[26px] font-extrabold text-[#1a1a1a]">
          <Microscope className="h-6 w-6 text-[#B5101F]" aria-hidden />
          Validation Studio
        </h1>
      </div>

      <p className="mb-5 max-w-[760px] text-[14px] text-[#9a8a8e]">
        Superfície operacional canónica da validação funcional do Sandbox. Prepara,
        descreve e cancela execuções; não executa percursos — o motor de execução
        é separado. Exclusivo do ambiente <strong>SANDBOX</strong>.
      </p>

      {/* The single most important statement this page makes. */}
      <div className="mb-6 flex max-w-[760px] items-start gap-3 rounded-[14px] border-[1.5px] border-amber-300 bg-amber-50 px-5 py-4">
        <Ban className="mt-0.5 h-5 w-5 flex-none text-amber-700" aria-hidden />
        <p className="text-[13.5px] leading-[1.5] text-amber-900">
          <strong>Nenhuma execução de validação foi iniciada.</strong> Esta superfície
          consegue preparar e verificar uma execução real, mas iniciar uma não está
          implementado — não existe rota que o faça.
        </p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-[#f1e3e3]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-[14px] font-semibold transition-colors ${
              tab === t.id
                ? 'border-b-[2.5px] border-[#B5101F] text-[#1a1a1a]'
                : 'text-[#9a8a8e] hover:text-[#1a1a1a]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} /> : !overview ? (
        <div className="text-[15px] text-[#9a8a8e]">A carregar…</div>
      ) : (
        <>
          {tab === 'overview' && (
            <Overview
              overview={overview}
              onPreflight={runPreflight}
              onPrepare={canPrepare ? prepareRun : undefined}
              busy={busy}
            />
          )}
          {tab === 'actors'    && <Actors actors={actors ?? []} />}
          {tab === 'profiles'  && <Profiles profiles={profiles ?? []} onPreflight={runPreflight} busy={busy} />}
          {tab === 'preflight' && (
            <Preflight
              preflight={preflight}
              profile={preflightFor}
              meetsMinimum={meetsMinimum}
              onRun={runPreflight}
              busy={busy}
            />
          )}
          {tab === 'runs' && <Runs runs={runs ?? []} onCancel={canPrepare ? cancelRun : undefined} busy={busy} />}
        </>
      )}
    </div>
  );
}

function Overview({
  overview, onPreflight, onPrepare, busy,
}: {
  overview: ValidationOverview;
  onPreflight: (p: string) => void;
  onPrepare?: (p: string) => void;
  busy: boolean;
}) {
  return (
    <div className="grid max-w-[980px] gap-5">
      <Card className="p-6">
        <CardHeader title="Estado do Studio" />
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-[14px] md:grid-cols-4">
          <div><dt className="text-[#9a8a8e]">Ambiente</dt><dd className="font-semibold">{overview.environment}</dd></div>
          <div><dt className="text-[#9a8a8e]">Actores</dt><dd className="font-semibold">{overview.actors}</dd></div>
          <div><dt className="text-[#9a8a8e]">Suites</dt><dd className="font-semibold">{overview.suites}</dd></div>
          <div>
            <dt className="text-[#9a8a8e]">Registo</dt>
            <dd className="font-mono text-[12.5px]" title={overview.registry_digest}>
              {overview.registry_digest.slice(0, 12)}…
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[13px] text-[#9a8a8e]">
          O registo está compilado no binário do admin-api, por isso esta superfície
          serve exactamente o registo que a revisão implantada reviu.
        </p>
      </Card>

      <Card className="p-6">
        <CardHeader title="Execução em curso" />
        <div className="mt-4">
          {overview.active_run ? (
            <div className="flex items-center gap-3">
              <Pill className={STATE_STYLE[overview.active_run.state]}>{overview.active_run.state}</Pill>
              <span className="font-mono text-[13px]">{overview.active_run.run_ref}</span>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[14px] text-[#1a1a1a]">
              <ShieldCheck className="h-4 w-4 text-green-600" aria-hidden />
              Nenhuma execução detém o Sandbox.
              {!overview.runs_ever_started && (
                <span className="text-[#9a8a8e]">Nenhuma execução foi alguma vez iniciada.</span>
              )}
            </p>
          )}
        </div>
      </Card>

      {overview.profiles.map((p) => (
        <Card key={p.id} className="p-6">
          <CardHeader title={`${p.name_pt} — ${p.id} v${p.version}`} />
          <p className="mt-3 max-w-[720px] text-[13.5px] leading-[1.55] text-[#4a4a4a]">{p.claim}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-[14px] md:grid-cols-4">
            <div><dt className="text-[#9a8a8e]">Suites</dt><dd className="font-semibold">{p.suites} ({p.blocking_suites} bloqueantes)</dd></div>
            <div><dt className="text-[#9a8a8e]">Verificação mínima</dt><dd className="font-semibold">{p.minimum_preflight}</dd></div>
            <div><dt className="text-[#9a8a8e]">Tecto de volume</dt><dd className="font-semibold">{formatKz(p.max_credit_volume_minor)}</dd></div>
            <div><dt className="text-[#9a8a8e]">PASS_WITH_RETRY</dt><dd className="font-semibold">{p.max_pass_with_retry}</dd></div>
          </dl>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => onPreflight(p.id)}
              disabled={busy}
              className="rounded-[10px] border-[1.5px] border-[#e5d5d5] px-4 py-2 text-[14px] font-semibold text-[#1a1a1a] hover:bg-[#faf5f5] disabled:opacity-50"
            >
              Verificar Sandbox
            </button>
            {onPrepare && (
              <button
                onClick={() => onPrepare(p.id)}
                disabled={busy}
                className="rounded-[10px] bg-[#B5101F] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#9A1B22] disabled:opacity-50"
              >
                Preparar execução
              </button>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-[#9a8a8e]">
            Preparar cria e verifica a execução. Não a inicia.
          </p>
        </Card>
      ))}
    </div>
  );
}

function Actors({ actors }: { actors: ValidationActor[] }) {
  return (
    <Card className="max-w-[980px] p-6">
      <CardHeader title={`Actores de validação (${actors.length})`} />
      <p className="mt-3 text-[13px] text-[#9a8a8e]">
        Cada actor indica <em>quais</em> credenciais possui, pelo nome. Nunca o valor,
        nem a referência ao segredo.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-[#f1e3e3] text-[12px] uppercase tracking-wide text-[#9a8a8e]">
            <tr>
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4">Identidade</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Credenciais</th>
              <th className="py-2">Função</th>
            </tr>
          </thead>
          <tbody>
            {actors.map((a) => (
              <tr key={a.id} className="border-b border-[#faf0f0] align-top">
                <td className="py-2.5 pr-4 font-mono font-semibold">{a.id}</td>
                <td className="py-2.5 pr-4">{a.type}</td>
                <td className="py-2.5 pr-4 font-mono text-[12.5px]">{a.handle ? `@${a.handle}` : a.email ?? '—'}</td>
                <td className="py-2.5 pr-4">
                  <Pill className={a.status === 'provisioned' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}>
                    {a.status}
                  </Pill>
                </td>
                <td className="py-2.5 pr-4">
                  {a.credential_names.length
                    ? a.credential_names.map((n) => (
                        <Pill key={n} className="mr-1 bg-neutral-100 text-neutral-700">{n}</Pill>
                      ))
                    : <span className="text-[#9a8a8e]">—</span>}
                </td>
                <td className="py-2.5 max-w-[280px] text-[12.5px] text-[#4a4a4a]">{a.purpose ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Profiles({
  profiles, onPreflight, busy,
}: { profiles: ValidationProfile[]; onPreflight: (p: string) => void; busy: boolean }) {
  return (
    <div className="grid max-w-[980px] gap-5">
      {profiles.map((p) => (
        <Card key={p.id} className="p-6">
          <CardHeader title={`${p.id} — ${p.name}`} />
          <p className="mt-3 max-w-[720px] text-[13.5px] leading-[1.55] text-[#4a4a4a]">{p.claim}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(p.suite_ids ?? []).map((s) => (
              <Pill
                key={s}
                className={(p.blocking_ids ?? []).includes(s)
                  ? 'bg-[#FBD2D0] text-[#9A1B22]'
                  : 'bg-neutral-100 text-neutral-700'}
              >
                {s}
              </Pill>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-[#9a8a8e]">
            A vermelho: suites bloqueantes — uma falha aqui reprova a execução.
            Um perfil pode promover uma suite a bloqueante; nunca despromover.
          </p>
          <p className="mt-3 font-mono text-[12px] text-[#9a8a8e]" title={p.digest}>
            digest {p.digest.slice(0, 16)}…
          </p>
          <button
            onClick={() => onPreflight(p.id)}
            disabled={busy}
            className="mt-4 rounded-[10px] border-[1.5px] border-[#e5d5d5] px-4 py-2 text-[14px] font-semibold text-[#1a1a1a] hover:bg-[#faf5f5] disabled:opacity-50"
          >
            Verificar Sandbox para {p.id}
          </button>
        </Card>
      ))}
    </div>
  );
}

function Preflight({
  preflight, profile, meetsMinimum, onRun, busy,
}: {
  preflight: ValidationPreflight | null;
  profile: string;
  meetsMinimum: boolean | null;
  onRun: (p: string) => void;
  busy: boolean;
}) {
  if (!preflight) {
    return (
      <Card className="max-w-[980px] p-6">
        <p className="text-[14px] text-[#9a8a8e]">
          Ainda não foi executada nenhuma verificação nesta sessão.
        </p>
        <button
          onClick={() => onRun(profile)}
          disabled={busy}
          className="mt-4 rounded-[10px] bg-[#B5101F] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#9A1B22] disabled:opacity-50"
        >
          Verificar agora ({profile})
        </button>
      </Card>
    );
  }

  const groups = [...new Set(preflight.checks.map((c) => c.group))];

  return (
    <div className="grid max-w-[980px] gap-5">
      <Card className="p-6">
        <div className={`flex items-start gap-3 rounded-[14px] border-[1.5px] px-5 py-4 ${VERDICT_STYLE[preflight.verdict]}`}>
          {preflight.verdict === 'HEALTHY'
            ? <ShieldCheck className="mt-0.5 h-5 w-5 flex-none" aria-hidden />
            : preflight.verdict === 'DEGRADED'
              ? <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" aria-hidden />
              : <CircleSlash className="mt-0.5 h-5 w-5 flex-none" aria-hidden />}
          <div>
            <p className="text-[15px] font-bold">{preflight.verdict}</p>
            <p className="mt-1 text-[13px]">
              {meetsMinimum === null
                ? 'Verificação sem perfil.'
                : meetsMinimum
                  ? `Satisfaz o mínimo exigido por ${profile}.`
                  : `NÃO satisfaz o mínimo exigido por ${profile}.`}
            </p>
          </div>
        </div>
        <p className="mt-4 text-[12.5px] text-[#9a8a8e]">
          Esta verificação não escreveu nada, não autenticou ninguém e não gastou
          orçamento. {formatDateTime(preflight.ended_at)}
        </p>
        <button
          onClick={() => onRun(profile)}
          disabled={busy}
          className="mt-4 rounded-[10px] border-[1.5px] border-[#e5d5d5] px-4 py-2 text-[14px] font-semibold text-[#1a1a1a] hover:bg-[#faf5f5] disabled:opacity-50"
        >
          Verificar de novo
        </button>
      </Card>

      {groups.map((g) => (
        <Card key={g} className="p-6">
          <CardHeader title={g} />
          <ul className="mt-3 space-y-2.5">
            {preflight.checks.filter((c) => c.group === g).map((c) => (
              <li key={`${c.group}.${c.id}`} className="flex items-start gap-3">
                <Pill className={`${CHECK_STYLE[c.status]} mt-[1px] flex-none`}>{c.status}</Pill>
                <div>
                  <p className="font-mono text-[12.5px] text-[#9a8a8e]">{c.id}</p>
                  <p className="text-[13.5px] text-[#1a1a1a]">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Runs({
  runs, onCancel, busy,
}: { runs: ValidationRun[]; onCancel?: (r: ValidationRun) => void; busy: boolean }) {
  if (!runs.length) {
    return (
      <Card className="max-w-[980px] p-6">
        <p className="text-[14px] text-[#1a1a1a]">Nenhuma execução foi preparada.</p>
        <p className="mt-2 text-[13px] text-[#9a8a8e]">
          Nenhuma execução GOLDEN ou FULL foi alguma vez iniciada neste Sandbox.
        </p>
      </Card>
    );
  }

  const terminal = ['COMPLETED', 'CANCELLED', 'ABANDONED'];

  return (
    <Card className="max-w-[980px] p-6">
      <CardHeader title={`Execuções (${runs.length})`} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-[#f1e3e3] text-[12px] uppercase tracking-wide text-[#9a8a8e]">
            <tr>
              <th className="py-2 pr-4">Referência</th>
              <th className="py-2 pr-4">Perfil</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Veredicto</th>
              <th className="py-2 pr-4">Preparada</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-[#faf0f0]">
                <td className="py-2.5 pr-4 font-mono font-semibold">{r.run_ref}</td>
                <td className="py-2.5 pr-4">{r.profile_id} v{r.profile_version}</td>
                <td className="py-2.5 pr-4"><Pill className={STATE_STYLE[r.state]}>{r.state}</Pill></td>
                <td className="py-2.5 pr-4">{r.verdict ?? '—'}</td>
                <td className="py-2.5 pr-4 text-[#9a8a8e]" title={formatDateTime(r.requested_at)}>
                  {timeAgo(r.requested_at)}
                </td>
                <td className="py-2.5">
                  {onCancel && !terminal.includes(r.state) && (
                    <button
                      onClick={() => onCancel(r)}
                      disabled={busy}
                      className="rounded-[8px] border-[1.5px] border-[#e5d5d5] px-3 py-1 text-[12.5px] font-semibold text-[#1a1a1a] hover:bg-[#faf5f5] disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[12.5px] text-[#9a8a8e]">
        Uma execução é evidência: não pode ser apagada, e o seu histórico de
        transições não pode ser reescrito.
      </p>
    </Card>
  );
}
