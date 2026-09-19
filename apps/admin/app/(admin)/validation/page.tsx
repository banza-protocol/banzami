'use client';

/**
 * BANZADMIN — Validation Studio, visão geral.
 *
 * The dashboard an operator reads before authorising a Validation Run. Every
 * number is served by admin-api from the canonical registry; nothing is
 * reconstructed here, and nothing shows a result before something observed it.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings2, UsersRound, Layers, FileSliders, PlayCircle, FileCode2, Boxes,
  BarChart3, ShieldCheck, Clock, BookOpen, Network, AlertTriangle, CircleSlash, Ban, Star, FileText,
} from 'lucide-react';
import { useStudio, getApi } from './studio-context';
import { useToast } from '@/components/ui/toast';
import { getSession } from '@/lib/session';
import { formatKz, timeAgo } from '@/lib/format';
import type { ValidationProfile, ValidationCheck, ValidationProfileOutcome } from '@/lib/admin-api';
import {
  Panel, IconChip, SectionHeader, MetricCard, Pill, Dot, Button, MoreLink, Row,
  Empty, Skeleton, Hash, Why, STATE_STYLE, CHECK_STYLE, VERDICT_SKIN, RUN_VERDICT_STYLE,
} from './studio-ui';

export default function StudioOverview() {
  const s = useStudio();
  const toast = useToast();
  const router = useRouter();

  // The preflight costs nothing — no write, no auth, no email, no quota — so
  // the dashboard may simply ask for it. That property is proven structurally
  // (INV-VS-008); without it this call would be spending the budget it reports.
  useEffect(() => {
    if (!s.loading && !s.preflight) void s.runPreflight('GOLDEN');
  }, [s.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const canPrepare = ['SUPER_ADMIN', 'OPERATIONS'].includes(getSession()?.user.role ?? '');

  async function prepare(profile: string) {
    const api = getApi();
    if (!api) return;
    s.setBusy(true);
    try {
      const key = `${profile}-${new Date().toISOString().slice(0, 16)}`;
      const res = await api.validationPrepareRun(profile, key);
      toast(res.run.state === 'READY' ? 'success' : 'warning',
        `${res.run.run_ref} preparada (${res.run.state}). ${res.note}`);
      await s.reload();
      router.push('/validation/runs');
    } catch {
      toast('danger', 'Não foi possível preparar a execução.');
    } finally { s.setBusy(false); }
  }

  // Counted from the runs themselves. The sentence above this used to assert
  // that the engine did not exist and that nothing had ever started, rendered
  // directly over a table of runs that engine had executed.
  const startedRuns = (s.overview?.recent_runs ?? []).filter((r) => r.started_at).length;
  const outcomeOf = (id: string) => (s.overview?.profile_outcomes ?? []).find((x) => x.profile_id === id);

  if (s.loading) return <DashboardSkeleton />;
  if (s.error) {
    return (
      <Panel className="p-6">
        <p className="text-[14px] font-bold text-red-800">{s.error}</p>
        <div className="mt-3"><Button onClick={() => void s.reload()}>Tentar de novo</Button></div>
      </Panel>
    );
  }

  const o = s.overview!;
  const blockingSuites = s.suites.filter((x) => x.blocking).length;
  const healthy = s.actors.filter((a) => a.status === 'provisioned').length;

  // A field the API omits must read as "indisponível", never white-screen the
  // page. This is defence in depth: the contract is asserted server-side
  // (TestOverview_CarriesEveryFieldTheStudioReads), and a page that dies on a
  // missing number tells the operator nothing at all.
  const coverage = o.coverage ?? null;
  const components = o.components ?? [];
  const profiles = o.profiles ?? [];

  return (
    <div className="flex flex-col gap-[18px]">
      {/* A. what this surface is, and what it deliberately is not */}
      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="flex items-start gap-4 border-[#f6dede] bg-[#FDF4F4] px-5 py-[18px]">
          <IconChip Icon={Network} />
          <div>
            <p className="text-[14.5px] font-extrabold leading-snug text-[#1a1a1a]">
              O Validation Studio prepara, verifica e cancela execuções de validação funcional do Sandbox.
            </p>
            <p className="mt-1 text-[13px] leading-[1.5] text-[#6a5a5e]">
              Não executa percursos: o motor de execução é um processo separado, que reclama
              a execução autorizada e a leva a cabo fora deste plano de controlo.
              {' '}{o.runs_ever_started
                ? `${startedRuns} execuç${startedRuns === 1 ? 'ão' : 'ões'} iniciada${startedRuns === 1 ? '' : 's'} até hoje.`
                : 'Nenhuma execução foi alguma vez iniciada.'}
            </p>
          </div>
        </Panel>

        <Panel className="flex items-center gap-3.5 px-5 py-[18px]">
          <IconChip Icon={BookOpen} tone="neutral" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-extrabold text-[#1a1a1a]">Ambiente exclusivo de validação</p>
            <p className="mt-0.5 text-[12.5px] text-[#9a8a8e]">
              Isolado da produção. O esquema não admite outro ambiente.
            </p>
          </div>
        </Panel>
      </div>

      {/* B. state at a glance */}
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard Icon={Settings2} label="Estado do Studio" tone="good"
          value={<span className="flex items-center gap-1.5"><Dot tone="good" />Operacional</span>}
          caption="Ambiente SANDBOX" />
        <MetricCard Icon={UsersRound} label="Actores" value={healthy}
          caption={`${healthy}/${s.actors.length} provisionados`} />
        <MetricCard Icon={Layers} label="Suites" value={s.suites.length}
          caption={`${blockingSuites} bloqueantes`} />
        <MetricCard Icon={FileSliders} label="Perfis" value={profiles.map((p) => p.id).join(' / ') || '—'}
          caption={`${profiles.length} perfis definidos`} />
        <MetricCard Icon={PlayCircle} label="Execuções activas" value={o.active_run ? 1 : 0}
          tone={o.active_run ? 'warn' : 'neutral'}
          caption={o.active_run ? o.active_run.run_ref : 'nenhuma em curso'} />
        <MetricCard Icon={FileCode2} label="Registo" tone="neutral"
          value={<span className="font-mono text-[14px]">{o.registry_digest.slice(0, 12)}…</span>}
          caption="compilado no admin-api" />
      </div>

      {/* The honesty counterweight the mockup has no room for, and the page needs. */}
      {coverage
        ? <Coverage coverage={coverage} lastFull={outcomeOf('FULL')} />
        : <Panel className="p-5"><SectionHeader Icon={Layers} tone="warn"
            title="Cobertura indisponível"
            subtitle="O control plane não reportou a cobertura do universo de validação." /></Panel>}

      {/* C + D. readiness beside the preflight */}
      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel className="p-5">
          <SectionHeader Icon={BarChart3} title="Validation Readiness"
            subtitle="Estado actual dos perfis de validação no ambiente SANDBOX." />
          <div className="mt-4 grid gap-3.5 lg:grid-cols-2">
            {profiles.map((p) => (
              <ProfileReadinessCard key={p.id} p={p} outcome={outcomeOf(p.id)}
                meets={s.preflightProfile === p.id ? s.meetsMinimum : null}
                verdict={s.preflight?.verdict ?? null}
                busy={s.busy}
                onCheck={() => void s.runPreflight(p.id)}
                onPrepare={canPrepare ? () => void prepare(p.id) : undefined} />
            ))}
          </div>
        </Panel>

        <PreflightSummary checks={s.preflight?.checks ?? null} verdict={s.preflight?.verdict ?? null} busy={s.busy} />
      </div>

      {/* E + F + G */}
      <div className="grid gap-[18px] xl:grid-cols-3">
        <ActorsPreview actors={s.actors} />
        <ProvenancePreview components={components} />
        <RecentRuns runs={s.runs} everStarted={o.runs_ever_started} />
      </div>

      {(o.blocking_issues ?? []).length > 0 && (
        <Panel className="p-5">
          <SectionHeader Icon={AlertTriangle} tone="warn" title="Bloqueadores operacionais"
            subtitle="O que impede uma execução de significar o que aparenta."
            action={<MoreLink label="Todos os registos" href="/validation/registry" />} />
          <ul className="mt-4 space-y-3">
            {(o.blocking_issues ?? []).map((i) => (
              <li key={i.id} className="flex items-start gap-3 border-b border-[#faf0f0] pb-3 last:border-0 last:pb-0">
                <Pill className="mt-[1px] bg-[#FDECEC] text-red-800">{i.id}</Pill>
                <div>
                  <p className="text-[13.5px] font-extrabold text-[#1a1a1a]">{i.title_pt ?? i.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-[1.5] text-[#6a5a5e]">{i.detail_pt ?? i.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/* ── coverage: the number the mockup has no room for ───────────────────── */

function Coverage({ coverage: c, lastFull }: {
  coverage: { suites: number; suites_declared: number; journeys: number; journeys_automated: number; journeys_runtime_proven: number };
  lastFull?: ValidationProfileOutcome;
}) {
  const executable = c.suites - c.suites_declared;
  const pct = c.suites ? Math.round((executable / c.suites) * 100) : 0;
  return (
    <Panel className="p-5">
      <SectionHeader Icon={Layers} tone="warn" title="Quanto do universo é realmente executável"
        subtitle="Uma suite existir não significa que algo seja testado."
        action={<MoreLink label="Ver registos" href="/validation/registry" />} />
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div className="min-w-[220px] flex-1">
          <div className="h-[9px] w-full overflow-hidden rounded-full bg-[#F1EEEE]">
            <div className="h-full rounded-full bg-[#B5101F]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[12.5px] text-[#9a8a8e]">
            {executable} de {c.suites} suites têm pelo menos um percurso executável definido.
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-9 gap-y-2">
          <div><dt className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">Percursos escritos</dt>
            <dd className="text-[19px] font-black text-[#1a1a1a]">{c.journeys}</dd></div>
          <div><dt className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">Automatizados</dt>
            <dd className="text-[19px] font-black text-[#1a1a1a]">{c.journeys_automated}</dd></div>
          <div><dt className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">Provados em execução</dt>
            <dd className={`text-[19px] font-black ${c.journeys_runtime_proven > 0 ? 'text-green-800' : 'text-amber-700'}`}>
              {c.journeys_runtime_proven}
            </dd>
            {/* HISTÓRICO, e o rótulo tem de o dizer. "13 já passaram alguma vez" e
                "13 estão provados contra o build actual" divergem no instante em
                que algo é implantado — e o segundo número existe: a matriz de
                preverificação lia 12/38 frescos contra este build. Deixar o
                rótulo ambíguo seria deixar o leitor escolher o que prefere. */}
            <dd className="text-[11px] leading-[1.35] text-[#a99a9e]">
              percursos distintos que já passaram<br />em pelo menos uma execução real
            </dd></div>
          {lastFull && (
            <div><dt className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">Última FULL alcançou</dt>
              <dd className="text-[19px] font-black text-[#1a1a1a]">
                {lastFull.journeys_executed} <span className="text-[13px] font-bold text-[#9a8a8e]">/ {lastFull.journeys_planned}</span>
              </dd>
              <dd className="text-[11px] text-[#a99a9e]">{lastFull.run_ref} · registos do plano</dd></div>
          )}
          <div><dt className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">NOT_PROVEN estrutural</dt>
            <dd className="text-[19px] font-black text-[#1a1a1a]">{c.suites_declared}</dd>
            <dd className="text-[11px] text-[#a99a9e]">suite(s) sem percurso executável</dd></div>
        </dl>
      </div>
    </Panel>
  );
}

/* ── profile readiness ─────────────────────────────────────────────────── */

function ProfileReadinessCard({ p, meets, verdict, outcome, busy, onCheck, onPrepare }: {
  p: ValidationProfile; meets: boolean | null; verdict: string | null;
  outcome?: ValidationProfileOutcome;
  busy: boolean; onCheck: () => void; onPrepare?: () => void;
}) {
  // "Não verificado" is true of a profile nobody has preflighted. It was also
  // being shown for FULL, which had been attempted, reached 9 of 38 journeys
  // and stopped at a cleanup barrier — one label for two very different states.
  // The last OUTCOME wins over the current preflight status, because what a
  // profile did is a stronger fact than whether someone asked it a question.
  const state = outcome?.verdict === 'PASS'
    ? { label: 'Última execução: PASS', cls: 'bg-[#E9F7EE] text-green-800', tone: 'good' as const }
    : outcome?.verdict === 'FAIL'
      ? { label: 'Última execução: FAIL', cls: 'bg-[#FDECEC] text-red-800', tone: 'bad' as const }
      : meets === null
        ? { label: 'Não verificado', cls: 'bg-[#F4F1F1] text-[#6a5a5e]', tone: 'idle' as const }
        : meets
          ? { label: 'Preparado', cls: 'bg-[#E9F7EE] text-green-800', tone: 'good' as const }
          : { label: 'Bloqueado', cls: 'bg-[#FDECEC] text-red-800', tone: 'bad' as const };

  return (
    <div className="rounded-[14px] border border-[#f4e7e7] bg-[#FFFCFC] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconChip Icon={p.id === 'GOLDEN' ? Star : Layers} size="sm" tone={p.id === 'GOLDEN' ? 'warn' : 'neutral'} />
          <a href={`/validation/profiles/${p.id}`} className="text-[15.5px] font-black tracking-[-0.01em] text-[#1a1a1a] hover:underline">
            {p.id} v{p.version}
          </a>
        </div>
        <Pill className={state.cls}><Dot tone={state.tone} />{state.label}</Pill>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-[1.5] text-[#6a5a5e]" title={p.claim_pt ?? p.claim}>{p.claim_pt ?? p.claim}</p>

      <dl className="mt-3 border-t border-[#f4e7e7] pt-2">
        <Row label="Suites" value={`${p.suites} (${p.blocking_suites} bloqueantes)`} />
        <Row label="Verificação mínima" value={
          <span className={p.minimum_preflight === 'HEALTHY' ? 'text-green-700' : 'text-amber-700'}>{p.minimum_preflight}</span>
        } />
        <Row label="Tecto de volume" value={formatKz(p.max_credit_volume_minor)} />
        <Row label="PASS_WITH_RETRY" value={p.max_pass_with_retry} />
        {outcome && (
          <>
            {/* The denominator counts materialised PLAN RECORDS, and for FULL
                one of those is a non-journey control row standing in for a
                suite with no executable journey. Typing CONTROL apart from
                JOURNEY is migration 0162's job; until it lands the label says
                what it counts rather than quietly reporting 38. */}
            <Row label="Alcançado no plano" value={
              <span className={outcome.journeys_executed === outcome.journeys_planned ? 'text-green-700' : 'text-amber-700'}>
                {outcome.journeys_executed} / {outcome.journeys_planned} registos
              </span>
            } />
            {outcome.cleanup_barrier_triggered && (
              <Row label="Barreira de limpeza" value={<span className="text-amber-700">DISPAROU</span>} />
            )}
            <Row label="Aceitação" value={
              outcome.verdict === 'PASS' && outcome.journeys_executed === outcome.journeys_planned
                ? <span className="text-green-700">ALCANÇADA</span>
                : <span className="text-red-700">NÃO ALCANÇADA</span>
            } />
          </>
        )}
      </dl>

      {outcome && (
        <p className="mt-2 text-[11.5px] leading-[1.45] text-[#9a8a8e]">
          {outcome.run_ref} · {outcome.state}
          {outcome.verdict ? ` · ${outcome.verdict}` : ''}
          {outcome.passed > 0 || outcome.failed > 0
            ? ` — ${outcome.passed} passaram, ${outcome.failed} falharam, ${outcome.not_reached} não alcançados`
            : ''}
          {/* A run that predates 0161 has no cleanup measurement. Saying nothing
              would let a reader assume it was clean; it was simply unmeasured. */}
          {!outcome.cleanup_measured && (
            <><br />Modelo de limpeza de recursos: introduzido depois desta execução.</>
          )}
        </p>
      )}

      {verdict && meets === false && (
        <p className="mt-2 text-[12px] font-bold text-red-700">
          Verificação actual {verdict} — não satisfaz {p.minimum_preflight}.
        </p>
      )}

      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <Button onClick={onCheck} disabled={busy} Icon={ShieldCheck}>Verificar</Button>
        {onPrepare
          ? <Button onClick={onPrepare} disabled={busy} variant="primary" Icon={PlayCircle}>Preparar</Button>
          : <Button disabled Icon={PlayCircle}>Preparar</Button>}
      </div>
      <p className="mt-1.5 text-[11.5px] text-[#a99a9e]">Preparar cria e verifica. Não inicia.</p>
    </div>
  );
}

/* ── preflight summary ─────────────────────────────────────────────────── */

function PreflightSummary({ checks, verdict, busy }: {
  checks: ValidationCheck[] | null; verdict: string | null; busy: boolean;
}) {
  const worst = (group: string) => {
    const g = (checks ?? []).filter((c) => c.group === group);
    if (!g.length) return null;
    for (const st of ['FAIL', 'WARN', 'UNAVAILABLE', 'SKIPPED', 'PASS']) {
      const hit = g.find((c) => c.status === st);
      if (hit) return { status: st, n: g.length, detail: hit.detail };
    }
    return null;
  };

  const groups = [
    { id: 'registry', label: 'Registo e actores' },
    { id: 'provenance', label: 'Proveniência dos componentes' },
    { id: 'actors', label: 'Identidades de produto' },
    { id: 'budget', label: 'Quota de volume' },
    { id: 'studio', label: 'Esquema e bloqueio de execução' },
  ];

  return (
    <Panel className="flex flex-col p-5">
      <SectionHeader Icon={ShieldCheck} tone={verdict === 'HEALTHY' ? 'good' : verdict ? 'warn' : 'neutral'}
        title="Verificação prévia" subtitle="Condições para preparar uma execução."
        action={verdict
          ? <Pill className={verdict === 'HEALTHY' ? 'bg-[#E9F7EE] text-green-800' : 'bg-[#FDF3E0] text-amber-900'}>
              <Dot tone={verdict === 'HEALTHY' ? 'good' : 'warn'} />{verdict}
            </Pill>
          : <Pill className="bg-[#F4F1F1] text-[#6a5a5e]">a medir…</Pill>} />

      <ul className="mt-4 flex-1">
        {!checks ? [0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="border-b border-[#faf0f0] py-2.5 last:border-0"><Skeleton className="h-[18px] w-full" /></li>
        )) : groups.map((g) => {
          const r = worst(g.id);
          if (!r) return null;
          const ok = r.status === 'PASS';
          return (
            <li key={g.id} className="flex items-center justify-between gap-3 border-b border-[#faf0f0] py-[9px] last:border-0">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full text-[11px] font-black ${
                  ok ? 'bg-[#E9F7EE] text-green-700' : 'bg-[#FDF3E0] text-amber-700'}`}>{ok ? '✓' : '!'}</span>
                <span className="truncate text-[13px] text-[#1a1a1a]">{g.label}</span>
              </span>
              <Pill className={CHECK_STYLE[r.status]}>{r.status} · {r.n}</Pill>
            </li>
          );
        })}
      </ul>

      {checks && (
        <p className="mt-3 text-[11.5px] leading-[1.5] text-[#a99a9e]">
          Esta verificação não escreveu nada, não autenticou ninguém e não gastou orçamento.
        </p>
      )}
      <div className="mt-3">
        <Button full disabled={busy} onClick={() => { window.location.href = '/validation/preflight'; }}>
          Ver detalhes da verificação prévia →
        </Button>
      </div>
    </Panel>
  );
}

/* ── lower grid ────────────────────────────────────────────────────────── */

const ACTOR_LABEL: Record<string, string> = {
  consumer: 'Consumidor', business: 'Comerciante', developer: 'Programador', operator: 'Operador',
};

function ActorsPreview({ actors }: { actors: { id: string; type: string; status: string }[] }) {
  return (
    <Panel className="p-5">
      <SectionHeader Icon={UsersRound} title="Actores"
        subtitle={`${actors.length} actores no SANDBOX`}
        action={<MoreLink label="Ver todos" href="/validation/actors" />} />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        {actors.map((a) => (
          <a key={a.id} href="/validation/actors"
            className="flex items-center gap-2 rounded-[10px] border border-[#f4e7e7] bg-[#FFFCFC] px-2.5 py-2 hover:bg-[#FDF4F4]">
            <Dot tone={a.status === 'provisioned' ? 'good' : 'warn'} />
            <span className="text-[12.5px] font-extrabold text-[#1a1a1a]">{a.id}</span>
            <span className="truncate text-[11.5px] text-[#9a8a8e]">{ACTOR_LABEL[a.type] ?? a.type}</span>
          </a>
        ))}
      </div>
    </Panel>
  );
}

function ProvenancePreview({ components }: {
  components: { name: string; revision?: string; revision_known: boolean; mandatory_for_preparation: boolean; provenance_source: string }[];
}) {
  const shown = components.filter((c) => c.mandatory_for_preparation);
  return (
    <Panel className="p-5">
      <SectionHeader Icon={Boxes} title="Proveniência"
        subtitle="Revisões implantadas no SANDBOX"
        action={<MoreLink label="Componentes" href="/validation/components" />} />
      <ul className="mt-4">
        {shown.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-3 border-b border-[#faf0f0] py-[9px] last:border-0">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-extrabold text-[#1a1a1a]">{c.name}</span>
              <span className="block truncate text-[11px] text-[#a99a9e]">{c.provenance_source}</span>
            </span>
            <span className="flex flex-none items-center gap-2">
              {c.revision_known
                ? <Hash value={c.revision ?? ''} />
                : <span className="text-[12px] font-bold text-amber-700">indisponível</span>}
              <Pill className={c.revision_known ? 'bg-[#E9F7EE] text-green-800' : 'bg-[#FDF3E0] text-amber-900'}>
                {c.revision_known ? 'lida' : 'não exposta'}
              </Pill>
            </span>
          </li>
        ))}
      </ul>
      <Why>
        Revisões implantadas, nunca o HEAD do repositório. Um componente obrigatório que não
        saiba dizer a sua revisão impede a preparação de chegar a READY.
      </Why>
    </Panel>
  );
}

function RecentRuns({ runs, everStarted }: {
  // Includes the verdict. The narrower shape this replaced is why the list
  // could not show one: a run that passed and a run that failed both arrived
  // here as nothing but COMPLETED.
  runs: { id: string; run_ref: string; profile_id: string; state: string; verdict: string | null;
          started_at: string | null; requested_at: string }[];
  everStarted: boolean;
}) {
  return (
    <Panel className="p-5">
      <SectionHeader Icon={Clock} title="Execuções recentes"
        subtitle={everStarted ? 'histórico de execuções' : 'nenhuma foi alguma vez iniciada'}
        action={<MoreLink label="Ver todas" href="/validation/runs" />} />

      {runs.length === 0 ? (
        <div className="mt-4">
          <Empty Icon={FileText} title="Nenhuma execução foi preparada"
            detail="O Validation Studio prepara e verifica execuções, mas não as inicia." />
        </div>
      ) : (
        <>
          <ul className="mt-4">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id} className="border-b border-[#faf0f0] py-[9px] last:border-0">
                <a href={`/validation/runs/${r.id}`} className="flex items-center justify-between gap-3 hover:opacity-80">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[12.5px] font-extrabold text-[#1a1a1a]">{r.run_ref}</span>
                    <span className="block text-[11px] text-[#a99a9e]">{r.profile_id} · {timeAgo(r.requested_at)}</span>
                  </span>
                  <span className="flex flex-none flex-col items-end gap-1">
                    <span className="flex items-center gap-1.5">
                      <Pill className={STATE_STYLE[r.state]}>{r.state}</Pill>
                      {/* The verdict is its own badge. COMPLETED alone read the
                          same for a run that passed and one that failed. */}
                      {r.verdict
                        ? <Pill className={RUN_VERDICT_STYLE[r.verdict] ?? 'bg-[#F4F1F1] text-[#6a5a5e]'}>{r.verdict}</Pill>
                        : <Pill className="bg-[#F4F1F1] text-[#a99a9e]">—</Pill>}
                    </span>
                    {!r.started_at && (
                      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[#a99a9e]">
                        nunca iniciada
                      </span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-[11px] border border-[#f6dede] bg-[#FDF4F4] px-3.5 py-2.5">
            <Ban className="mt-[1px] h-[15px] w-[15px] flex-none text-[#B5101F]" strokeWidth={2} aria-hidden />
            <p className="text-[12px] leading-[1.5] text-[#6a5a5e]">
              {runs.some((r) => r.started_at) ? (
                <>
                  Uma execução é <strong>evidência</strong>: o estado diz o que lhe aconteceu,
                  o veredicto diz o que ela provou. Um <strong>COMPLETED</strong> sem veredicto
                  não é uma passagem.
                </>
              ) : (
                <>Estas execuções foram <strong>preparadas e canceladas</strong>. Nenhuma correu.</>
              )}
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ── loading ───────────────────────────────────────────────────────────── */

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-[86px]" /><Skeleton className="h-[86px]" />
      </div>
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[86px]" />)}
      </div>
      <Skeleton className="h-[120px]" />
      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <Skeleton className="h-[320px]" /><Skeleton className="h-[320px]" />
      </div>
      <div className="grid gap-[18px] xl:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[260px]" />)}
      </div>
    </div>
  );
}
