'use client';

/**
 * A Validation Run detail is an AUDIT RECORD, not a CRUD detail page.
 *
 * Two distinctions govern it, and both are load-bearing:
 *
 *   PINNED vs CURRENT. What the run was evaluated against is not what is
 *   deployed now. The pinned revisions keep saying what they said after the
 *   Sandbox moves on, and the drift is shown beside them rather than replacing
 *   them.
 *
 *   NO EXECUTION EVIDENCE vs MISSING EVIDENCE. A run that never started has no
 *   evidence because nothing ran — an intentional product state. A run that
 *   executed and produced none would be a defect. They must never look alike.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, PlayCircle, Boxes, ShieldCheck, Clock, FileText, FileSliders,
  UsersRound, Ban, CircleSlash, Layers,
} from 'lucide-react';
import { getApi, useStudio } from '../../studio-context';
import { formatDateTime, formatKz } from '@/lib/format';
import type {
  ValidationRun, ValidationRunEvent, ValidationProvenanceRow,
  ValidationPinnedPreflight, ValidationComponent, ValidationCheck,
  ValidationRunJourney,
} from '@/lib/admin-api';
import {
  Panel, SectionHeader, Pill, Field, AsOf, Why, Empty, Skeleton, Hash, Dot,
  STATE_STYLE, CHECK_STYLE,
} from '../../studio-ui';

type Detail = {
  run: ValidationRun; events: ValidationRunEvent[];
  journeys: ValidationRunJourney[];
  pinned_provenance: ValidationProvenanceRow[];
  pinned_preflight: ValidationPinnedPreflight | null;
  provenance_captured: boolean; ever_started: boolean;
  journeys_executed: number; evidence_rows: number;
};

/** The presentation label. The stored enum is untouched. */
function stateLabel(run: ValidationRun): { pill: string; note: string | null } {
  if (run.started_at) return { pill: run.state, note: null };
  if (['CANCELLED', 'ABANDONED'].includes(run.state)) return { pill: run.state, note: 'Nunca iniciada' };
  return { pill: run.state, note: 'Ainda não iniciada' };
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useStudio();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const api = getApi();
    if (!api || !id) return;
    api.validationRun(decodeURIComponent(id))
      .then(setD)
      .catch(() => setErr('Não foi possível carregar esta execução.'));
  }, [id]);

  if (err) {
    return (
      <Panel className="p-6">
        <SectionHeader Icon={CircleSlash} tone="bad" title="Execução não encontrada" subtitle={err} />
      </Panel>
    );
  }
  if (!d) {
    return (
      <div className="flex flex-col gap-[18px]">
        <Skeleton className="h-[150px]" />
        <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <Skeleton className="h-[280px]" /><Skeleton className="h-[280px]" />
        </div>
      </div>
    );
  }

  const { run, events, pinned_provenance: prov, pinned_preflight: pf } = d;
  const label = stateLabel(run);
  const current = s.overview?.components ?? [];

  return (
    <div className="flex flex-col gap-[18px]">
      <button onClick={() => router.push('/validation/runs')}
        className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#9a8a8e] hover:text-[#1a1a1a]">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todas as execuções
      </button>

      {/* A. header + summary */}
      <Panel className="p-5">
        <SectionHeader Icon={PlayCircle} title={run.run_ref}
          subtitle={`${run.profile_id} v${run.profile_version} · ${run.environment}`}
          action={
            <span className="flex flex-wrap items-center gap-1.5">
              <Pill className={STATE_STYLE[run.state]}>{label.pill}</Pill>
              {label.note && <Pill className="bg-[#F1EEEE] text-[#6a5a5e]">{label.note}</Pill>}
            </span>} />
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3.5 md:grid-cols-4">
          <Field label="Preparada">{formatDateTime(run.requested_at)}</Field>
          <Field label="Iniciada">
            {run.started_at ? formatDateTime(run.started_at)
              : <span className="font-extrabold text-green-700">nunca</span>}
          </Field>
          <Field label="Terminada">{run.ended_at ? formatDateTime(run.ended_at) : '—'}</Field>
          <Field label="Veredicto">{run.verdict ?? '—'}</Field>
          <Field label="Percursos executados">
            <span className={d.journeys_executed ? '' : 'font-extrabold text-green-700'}>{d.journeys_executed}</span>
          </Field>
          <Field label="Evidência de execução">
            <span className={d.evidence_rows ? '' : 'font-extrabold text-green-700'}>{d.evidence_rows}</span>
          </Field>
          <Field label="Proveniência">
            {d.provenance_captured
              ? <span className="font-extrabold text-green-700">{prov.length} componentes</span>
              : <span className="font-extrabold text-amber-700">não capturada</span>}
          </Field>
          <Field label="Verificação prévia">
            {pf ? <Pill className={pf.verdict === 'HEALTHY' ? 'bg-[#E9F7EE] text-green-800' : 'bg-[#FDF3E0] text-amber-900'}>{pf.verdict}</Pill>
                : <span className="text-[#a99a9e]">não persistida</span>}
          </Field>
        </dl>
        {run.cancel_reason && (
          <p className="mt-3 text-[12.5px] text-[#6a5a5e]">
            <span className="text-[#a99a9e]">Motivo do cancelamento: </span>{run.cancel_reason}
          </p>
        )}
      </Panel>

      {/* D + E. what the run is bound to */}
      <div className="grid gap-[18px] xl:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader Icon={FileSliders} tone="neutral" title="Ligação ao perfil"
            subtitle="Fixada na preparação; editar o perfil depois não redescreve esta execução."
            action={<AsOf live={false} at={formatDateTime(run.requested_at)} />} />
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3">
            <Field label="Perfil">{run.profile_id}</Field>
            <Field label="Versão">v{run.profile_version}</Field>
            <div className="col-span-2">
              <Field label="Digest do perfil"><Hash value={run.profile_digest} chars={24} /></Field>
            </div>
          </dl>
        </Panel>

        <Panel className="p-5">
          <SectionHeader Icon={UsersRound} tone="neutral" title="Actores"
            subtitle="Quem teria participado, derivado dos percursos do perfil." />
          <ActorBinding profileID={run.profile_id} />
        </Panel>
      </div>

      {/* F. provenance — pinned, with drift beside it */}
      <Panel className="p-5">
        <SectionHeader Icon={Boxes} title="Proveniência"
          subtitle="Os componentes contra os quais esta execução foi avaliada."
          action={<AsOf live={false} at={formatDateTime(run.requested_at)} />} />
        {prov.length === 0 ? (
          <div className="mt-4">
            <Empty Icon={Ban} title="Proveniência não capturada nesta execução"
              detail="Esta execução foi preparada antes da correcção C.10. A ausência é evidência histórica do defeito e não foi preenchida a partir do estado actual." />
          </div>
        ) : (
          <ProvenanceTable pinned={prov} current={current} />
        )}
      </Panel>

      {/* B. preflight snapshot */}
      <Panel className="p-5">
        <SectionHeader Icon={ShieldCheck} title="Verificação prévia"
          subtitle="O instantâneo guardado com a execução — não uma medição de agora."
          action={<AsOf live={false} at={pf ? formatDateTime(pf.started_at) : undefined} />} />
        {!pf ? (
          <div className="mt-4">
            <Empty title="Sem verificação persistida"
              detail="Nenhum instantâneo foi guardado com esta execução." />
          </div>
        ) : <PinnedChecks checks={pf.checks} />}
      </Panel>

      {/* G. timeline */}
      <Panel className="p-5">
        <SectionHeader Icon={Clock} title="Cronologia"
          subtitle="Histórico append-only: não pode ser reescrito nem apagado." />
        <Timeline events={events} everStarted={!!run.started_at} />
      </Panel>

      {/* G2. the execution hierarchy — Run → Suite → Journey → Assertion.
          Only rendered once a run has a plan; an unstarted run has nothing to
          show here and the empty states below say so precisely. */}
      {(d.journeys ?? []).length > 0 && (
        <Panel className="p-5">
          <SectionHeader Icon={Layers} title={`Percursos (${d.journeys.length})`}
            subtitle="O plano inteiro, incluindo o que não chegou a correr." />
          <JourneyMatrix journeys={d.journeys} />
          <Why>
            Um percurso <strong>PLANNED</strong> não é uma omissão: a execução regista o
            que <em>tencionava</em> fazer antes de começar, para que uma execução
            interrompida não pareça uma execução curta.
          </Why>
        </Panel>
      )}

      {/* H + I. the two empty states that must not look alike */}
      <div className="grid gap-[18px] xl:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader Icon={PlayCircle} tone="neutral" title="Execução" />
          {d.journeys_executed === 0 ? (
            <div className="mt-4">
              <Empty Icon={Ban} title="Nenhum percurso foi executado"
                detail="Esta execução nunca foi iniciada." />
              <ul className="mx-auto mt-3 max-w-[420px] space-y-1 text-[12.5px] text-[#6a5a5e]">
                <li>• Foi preparada e verificada, mas nunca posta em fila.</li>
                <li>• <span className="font-mono text-[12px]">started_at</span> nunca foi preenchido.</li>
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-[13.5px]">
              <strong>{d.journeys_executed}</strong> percursos executados de {(d.journeys ?? []).length} planeados.
            </p>
          )}
        </Panel>

        <Panel className="p-5">
          <SectionHeader Icon={FileText} tone="neutral" title="Evidência" />
          <div className="mt-4">
            {!run.started_at ? (
              <>
                <Empty Icon={FileText} title="Não existe evidência de execução"
                  detail="Esperado: esta execução nunca foi iniciada, por isso não havia nada para capturar." />
                <Why>
                  Distinto de <strong>evidência em falta após execução</strong>, que seria um
                  defeito. Aqui nada correu; ali algo correu e não deixou registo.
                </Why>
              </>
            ) : d.evidence_rows === 0 ? (
              <Empty Icon={CircleSlash} title="Evidência em falta após execução"
                detail="Esta execução correu e não deixou artefactos. Isto é um defeito, não um estado esperado." />
            ) : (
              <p className="text-[13.5px]">{d.evidence_rows} artefactos.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── provenance with drift ─────────────────────────────────────────────── */

function ProvenanceTable({ pinned, current }: {
  pinned: ValidationProvenanceRow[]; current: ValidationComponent[];
}) {
  const now = new Map(current.map((c) => [c.name, c]));
  return (
    <>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
            <tr>
              <th className="py-2 pr-4">Componente</th>
              <th className="py-2 pr-4">Revisão fixada</th>
              <th className="py-2 pr-4">Revisão actual</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {pinned.map((p) => {
              const c = now.get(p.component);
              const knownNow = c?.revision_known ? c.revision : null;
              const status = !knownNow
                ? { label: 'UNAVAILABLE', cls: 'bg-[#EDE9E9] text-[#5a4a4e]', tone: 'idle' as const }
                : knownNow === p.revision
                  ? { label: 'SAME', cls: 'bg-[#E9F7EE] text-green-800', tone: 'good' as const }
                  : { label: 'CHANGED', cls: 'bg-[#FDF3E0] text-amber-900', tone: 'warn' as const };
              return (
                <tr key={p.component} className="border-b border-[#faf0f0]">
                  <td className="py-2 pr-4 font-extrabold">{p.component}</td>
                  <td className="py-2 pr-4"><Hash value={p.revision} chars={16} /></td>
                  <td className="py-2 pr-4">
                    {knownNow ? <Hash value={knownNow} chars={16} />
                      : <span className="text-[12px] text-[#a99a9e]">indisponível</span>}
                  </td>
                  <td className="py-2 pr-4">
                    <Pill className={status.cls}><Dot tone={status.tone} />{status.label}</Pill>
                  </td>
                  <td className="py-2 text-[12px] text-[#9a8a8e]">{p.detail?.source ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Why>
        A coluna fixada continua a dizer o que esta execução testou, mesmo depois de o Sandbox
        ser reimplantado. <strong>CHANGED</strong> não invalida a execução — diz apenas que o
        que está implantado hoje já não é o que foi avaliado.
      </Why>
    </>
  );
}

/* ── pinned checks, grouped, with the numbers kept ─────────────────────── */

const GROUP_LABEL: Record<string, string> = {
  registry: 'Registo', provenance: 'Proveniência', actors: 'Actores',
  budget: 'Capacidade e quota', studio: 'Esquema do Studio', database: 'Base de dados',
};

function PinnedChecks({ checks }: { checks: ValidationCheck[] }) {
  const groups = [...new Set(checks.map((c) => c.group))];
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g} className="rounded-[13px] border border-[#f4e7e7] p-4">
          <p className="text-[12px] font-black uppercase tracking-[0.04em] text-[#a99a9e]">
            {GROUP_LABEL[g] ?? g}
          </p>
          <ul className="mt-2">
            {checks.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="border-b border-[#faf0f0] py-2 last:border-0">
                <div className="flex items-start gap-2.5">
                  <Pill className={`${CHECK_STYLE[c.status]} mt-[1px] flex-none`}>{c.status}</Pill>
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-[#a99a9e]">{c.id}</p>
                    <p className="text-[12.5px] leading-snug">{c.detail}</p>
                    {c.measured && Object.keys(c.measured).length > 0 && (
                      <Measured m={c.measured} />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Measured({ m }: { m: Record<string, number> }) {
  const budget = m.limit_minor !== undefined && m.headroom_minor !== undefined;
  if (!budget) {
    return (
      <p className="mt-1 font-mono text-[11px] text-[#6a5a5e]">
        {Object.entries(m).map(([k, v]) => `${k}=${v}`).join('  ')}
      </p>
    );
  }
  return (
    <table className="mt-1.5 text-[11.5px]">
      <tbody>
        <tr><td className="pr-5 text-[#9a8a8e]">Observado</td><td className="font-mono">{formatKz(m.used_minor ?? 0)}</td></tr>
        <tr><td className="pr-5 text-[#9a8a8e]">Limite</td><td className="font-mono">{formatKz(m.limit_minor!)}</td></tr>
        <tr><td className="pr-5 text-[#9a8a8e]">Folga</td><td className="font-mono font-extrabold">{formatKz(m.headroom_minor!)}</td></tr>
        {m.profile_ceiling_minor !== undefined && (
          <tr><td className="pr-5 text-[#9a8a8e]">Tecto do perfil</td><td className="font-mono">{formatKz(m.profile_ceiling_minor)}</td></tr>
        )}
      </tbody>
    </table>
  );
}

/* ── timeline ──────────────────────────────────────────────────────────── */

function Timeline({ events, everStarted }: { events: ValidationRunEvent[]; everStarted: boolean }) {
  return (
    <>
      <ol className="mt-4 pl-1">
        {events.map((e, i) => (
          <li key={e.seq} className="relative flex gap-4 pb-5 last:pb-0">
            {i < events.length - 1 && (
              <span aria-hidden className="absolute left-[76px] top-[16px] h-full w-px bg-[#f1e3e3]" />
            )}
            <span className="w-[64px] flex-none pt-[1px] text-right font-mono text-[11.5px] text-[#a99a9e]">
              {new Date(e.occurred_at).toISOString().slice(11, 19)}
            </span>
            <span aria-hidden className={`mt-[5px] h-[11px] w-[11px] flex-none rounded-full border-2 border-white ${
              e.to_state === 'CANCELLED' ? 'bg-[#cbbaba]' : 'bg-[#B5101F]'}`} />
            <div className="min-w-0 flex-1">
              <Pill className={STATE_STYLE[e.to_state]}>{e.to_state}</Pill>
              {e.reason && <p className="mt-1 text-[12.5px] text-[#6a5a5e]">{e.reason}</p>}
            </div>
          </li>
        ))}
      </ol>
      {!everStarted && (
        <div className="mt-2 flex items-start gap-2 rounded-[11px] border border-[#f6dede] bg-[#FDF4F4] px-3.5 py-2.5">
          <Ban className="mt-[1px] h-[15px] w-[15px] flex-none text-[#B5101F]" strokeWidth={2} aria-hidden />
          <p className="text-[12px] leading-[1.5] text-[#6a5a5e]">
            Não houve execução entre <strong>READY</strong> e <strong>CANCELLED</strong>.
            A cronologia não salta nada: não existe estado intermédio por mostrar.
          </p>
        </div>
      )}
    </>
  );
}

/* ── actors the profile would have used ────────────────────────────────── */

function ActorBinding({ profileID }: { profileID: string }) {
  const s = useStudio();
  const suites = s.suites.filter((x) => x.profiles.includes(profileID));
  const actors = [...new Set(suites.flatMap((x) => x.journeys).flatMap((j) => j.actors ?? []))].sort();

  if (actors.length === 0) {
    return (
      <div className="mt-4">
        <Empty title="Nenhum actor vinculado"
          detail="Nenhum percurso deste perfil nomeia actores, porque quase nenhum percurso está escrito." />
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {actors.map((a) => <Pill key={a} className="bg-[#F4F1F1] text-[#6a5a5e]">{a}</Pill>)}
    </div>
  );
}

/* ── the execution hierarchy ───────────────────────────────────────────── */

const OUTCOME_STYLE: Record<string, string> = {
  PASSED: 'bg-[#E9F7EE] text-green-800',
  FAILED: 'bg-[#FDECEC] text-red-800',
  UNAVAILABLE: 'bg-[#FDF3E0] text-amber-900',
  SKIPPED: 'bg-[#FDF3E0] text-amber-900',
  PLANNED: 'bg-[#F1EEEE] text-[#6a5a5e]',
  OBSERVED: 'bg-[#E8F0FD] text-blue-800',
  ASSERTED: 'bg-[#EAE9FB] text-indigo-800',
};

function JourneyMatrix({ journeys }: { journeys: ValidationRunJourney[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const bySuite = new Map<string, ValidationRunJourney[]>();
  for (const j of journeys) {
    if (!bySuite.has(j.suite_id)) bySuite.set(j.suite_id, []);
    bySuite.get(j.suite_id)!.push(j);
  }

  const secs = (j: ValidationRunJourney) =>
    j.started_at && j.ended_at
      ? Math.round((Date.parse(j.ended_at) - Date.parse(j.started_at)) / 1000)
      : null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {[...bySuite.entries()].map(([suite, js]) => (
        <div key={suite}>
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-[#a99a9e]">{suite}</p>
          <ul className="mt-1.5 space-y-1.5">
            {js.map((j) => {
              // Only PASS and FAIL are assertions. A NOTE is a measurement the
              // harness wrote down, and counting it as a check would inflate
              // every number on this page.
              const asserts = j.assertions.filter((a) => a.verdict === 'PASS' || a.verdict === 'FAIL');
              const failed = asserts.filter((a) => a.verdict === 'FAIL');
              const notes = j.assertions.length - asserts.length;
              const isOpen = open === j.journey_id;
              return (
                <li key={j.journey_id} className="rounded-[12px] border border-[#f4e7e7]">
                  <button onClick={() => setOpen(isOpen ? null : j.journey_id)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FFFCFC]">
                    <Pill className={OUTCOME_STYLE[j.outcome] ?? 'bg-[#F1EEEE] text-[#6a5a5e]'}>{j.outcome}</Pill>
                    <span className="font-mono text-[11.5px] text-[#a99a9e]">{j.journey_id}</span>
                    <span className="ml-auto flex items-center gap-3 text-[12px] text-[#6a5a5e]">
                      {asserts.length > 0 && (
                        <span className={failed.length ? 'font-extrabold text-red-700' : ''}>
                          {asserts.length - failed.length}/{asserts.length} asserções
                        </span>
                      )}
                      {notes > 0 && <span className="text-[#a99a9e]">{notes} medições</span>}
                      {secs(j) !== null && <span className="tabular-nums text-[#a99a9e]">{secs(j)}s</span>}
                    </span>
                  </button>
                  {j.detail && (
                    <p className="px-4 pb-2 text-[12px] text-[#6a5a5e]">{j.detail}</p>
                  )}
                  {isOpen && (
                    <div className="border-t border-[#faf0f0] px-4 py-3">
                      {j.assertions.length === 0 ? (
                        <p className="text-[12.5px] text-[#a99a9e]">
                          Nenhuma asserção registada — o harness não chegou a produzir evidência.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {j.assertions.map((a, i) => (
                            <li key={`${a.gate}-${i}`} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                              <Dot tone={a.verdict === 'PASS' ? 'good' : a.verdict === 'FAIL' ? 'bad' : 'idle'} />
                              <span className="font-mono text-[11.5px]">{a.gate}</span>
                              <span className="text-[#a99a9e]">{a.verdict || 'ILEGÍVEL'}</span>
                              <Hash value={a.sha256} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
