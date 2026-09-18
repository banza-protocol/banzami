'use client';

import { useState } from 'react';
import { Library, ShieldCheck, AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react';
import { useStudio } from '../studio-context';
import type { ValidationSuiteDetail, ValidationJourney } from '@/lib/admin-api';
import { Panel, SectionHeader, Pill, StatusPill, Button, Why, Empty, Field, CHECK_STYLE } from '../studio-ui';

type View = 'suites' | 'invariants' | 'debt';

export default function RegistryPage() {
  const s = useStudio();
  const [view, setView] = useState<View>('suites');
  const [suiteId, setSuiteId] = useState<string | null>(null);
  const [journeyId, setJourneyId] = useState<string | null>(null);

  const suite = s.suites.find((x) => x.id === suiteId);
  const journey = suite?.journeys.find((j) => j.id === journeyId);

  if (journey && suite) return <JourneyView journey={journey} suite={suite} onBack={() => setJourneyId(null)} />;
  if (suite) return <SuiteView suite={suite} onBack={() => setSuiteId(null)} onOpen={setJourneyId} />;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex gap-2">
        {([['suites', 'Suites e percursos'], ['invariants', 'Invariantes'], ['debt', 'Dívida de validação']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`rounded-[11px] px-[15px] py-[9px] text-[13px] font-extrabold transition-colors ${
              view === id ? 'bg-[#FFF1F0] text-banzami' : 'text-[#9a8a8e] hover:bg-[#FFF7F6]'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'suites' && (
        <Panel className="p-5">
          <SectionHeader Icon={Library} title={`Suites (${s.suites.length})`}
            subtitle="Derivadas do registo canónico. O estado diz se algo é executável." />
          <Why>
            Uma suite existir não significa que algo seja testado. As que não têm percurso nenhum
            aparecem como DECLARED, e incluí-las num perfil não as torna testadas.
          </Why>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
                <tr>
                  <th className="py-2 pr-4">ID</th><th className="py-2 pr-4">Suite</th>
                  <th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Percursos</th>
                  <th className="py-2 pr-4">Bloqueante</th><th className="py-2 pr-4">Perfis</th><th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {s.suites.map((x) => (
                  <tr key={x.id} onClick={() => setSuiteId(x.id)}
                    className="cursor-pointer border-b border-[#faf0f0] hover:bg-[#FFFCFC]">
                    <td className="py-2.5 pr-4 font-mono font-extrabold">{x.id}</td>
                    <td className="py-2.5 pr-4">{x.name_pt}</td>
                    <td className="py-2.5 pr-4"><StatusPill status={x.implementation_status} /></td>
                    <td className="py-2.5 pr-4 font-extrabold">{x.journeys.length}</td>
                    <td className="py-2.5 pr-4">
                      {x.blocking ? <Pill className="bg-[#FBE9E9] text-[#9A1B22]">sim</Pill> : <span className="text-[#a99a9e]">não</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-[12px]">{x.profiles.join(', ') || '—'}</td>
                    <td className="py-2.5"><ChevronRight className="h-4 w-4 text-[#cbbaba]" aria-hidden /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {view === 'invariants' && (
        <Panel className="p-5">
          <SectionHeader Icon={ShieldCheck} tone="good" title={`Invariantes (${s.invariants.length})`}
            subtitle="As garantias do Studio, onde cada uma é imposta, e o que a prova." />
          <ul className="mt-4">
            {s.invariants.map((i) => (
              <li key={i.id} className="border-b border-[#faf0f0] py-3.5 last:border-0">
                <div className="flex items-start gap-3">
                  <Pill className={{
                    database: 'bg-[#EAE9FB] text-indigo-800', application: 'bg-[#E8F0FD] text-blue-800',
                    build: 'bg-[#F1EEEE] text-[#6a5a5e]',
                  }[i.enforced_by] ?? 'bg-[#F1EEEE] text-[#6a5a5e]'}>{i.enforced_by}</Pill>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-extrabold text-[#1a1a1a]">
                      <span className="mr-2 font-mono text-[11.5px] text-[#a99a9e]">{i.id}</span>{i.title}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-[1.5] text-[#6a5a5e]">{i.why}</p>
                    <p className="mt-1 font-mono text-[11.5px] text-[#a99a9e]">{i.layer}</p>
                    <p className="font-mono text-[11.5px] text-[#a99a9e]">prova: {i.proof}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {view === 'debt' && (
        <Panel className="p-5">
          <SectionHeader Icon={AlertTriangle} tone="warn" title={`Dívida de validação (${s.issues.length})`}
            subtitle="Só o que altera quanto se deve confiar numa execução." />
          <ul className="mt-4">
            {s.issues.map((i) => (
              <li key={i.id} className="border-b border-[#faf0f0] py-3.5 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill className={{ high: 'bg-[#FDECEC] text-red-800', medium: 'bg-[#FDF3E0] text-amber-900', low: 'bg-[#F1EEEE] text-[#6a5a5e]' }[i.severity] ?? ''}>
                    {i.severity}
                  </Pill>
                  <Pill className={i.status === 'open' ? 'bg-[#FDF3E0] text-amber-900' : 'bg-[#E9F7EE] text-green-800'}>{i.status}</Pill>
                  <span className="font-mono text-[11.5px] text-[#a99a9e]">{i.id}</span>
                  <span className="text-[13.5px] font-extrabold text-[#1a1a1a]">{i.title}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-[1.5] text-[#6a5a5e]">{i.detail}</p>
                <p className="mt-1 text-[11.5px] text-[#a99a9e]">
                  âmbito: {i.scope} · bloqueia GOLDEN: {i.blocks_golden ? 'sim' : 'não'} ·
                  bloqueia FULL: {i.blocks_full ? 'sim' : 'não'} · observado {i.first_observed}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Back({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[13px] font-extrabold text-[#9a8a8e] hover:text-[#1a1a1a]">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}

function SuiteView({ suite, onBack, onOpen }: {
  suite: ValidationSuiteDetail; onBack: () => void; onOpen: (id: string) => void;
}) {
  return (
    <div>
      <Back onBack={onBack} label="Todas as suites" />
      <Panel className="p-5">
        <SectionHeader Icon={Library} title={`${suite.id} — ${suite.name_pt}`}
          subtitle={suite.name} action={<StatusPill status={suite.implementation_status} />} />
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
          <Field label="Bloqueante">{suite.blocking ? 'sim' : 'não'}</Field>
          <Field label="Cobertura declarada">{suite.existing_coverage ?? '—'}</Field>
          <Field label="Perfis">{suite.profiles.join(', ') || '—'}</Field>
          <Field label="Percursos">{suite.journeys.length}</Field>
        </dl>
        {suite.scope && <><p className="mt-4 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">Âmbito</p>
          <p className="mt-1 text-[13px] leading-[1.55] text-[#1a1a1a]">{suite.scope}</p></>}
        {suite.rationale && <><p className="mt-4 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">Porque existe</p>
          <p className="mt-1 text-[13px] leading-[1.55] text-[#1a1a1a]">{suite.rationale}</p></>}
      </Panel>

      <Panel className="mt-[18px] p-5">
        <SectionHeader Icon={Library} tone="neutral" title={`Percursos (${suite.journeys.length})`} />
        {suite.journeys.length === 0 ? (
          <div className="mt-4">
            <Empty title="Nenhum percurso executável definido"
              detail="Esta suite está DECLARED: o âmbito está escrito, mas não existe cenário que possa ser executado. Incluí-la num perfil não a torna testada." />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {suite.journeys.map((j) => (
              <li key={j.id}>
                <button onClick={() => onOpen(j.id)}
                  className="flex w-full items-center justify-between rounded-[12px] border border-[#f4e7e7] px-4 py-3 text-left hover:bg-[#FFFCFC]">
                  <span><span className="font-mono text-[11.5px] text-[#a99a9e]">{j.id}</span>
                    <span className="ml-3 text-[13.5px] font-extrabold">{j.name}</span></span>
                  <span className="flex items-center gap-3"><StatusPill status={j.implementation_status} />
                    <ChevronRight className="h-4 w-4 text-[#cbbaba]" aria-hidden /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function JourneyView({ journey: j, suite, onBack }: {
  journey: ValidationJourney; suite: ValidationSuiteDetail; onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <div><Back onBack={onBack} label={`${suite.id} — ${suite.name_pt}`} /></div>

      <Panel className="p-5">
        <SectionHeader Icon={Library} title={j.name} subtitle={j.id}
          action={<StatusPill status={j.implementation_status} />} />
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
          <Field label="Suite">{j.suite}</Field>
          <Field label="Automação">{j.automation ?? '—'}</Field>
          <Field label="Superfície">{j.entry_surface ?? '—'}</Field>
          <Field label="Caminho"><span className="font-mono text-[12px]">{j.entry_path ?? '—'}</span></Field>
        </dl>
        {j.harness && (
          <p className="mt-3 text-[12px] text-[#9a8a8e]">
            Orquestra o harness existente <span className="font-mono">{j.harness}</span> — não o reimplementa.
          </p>
        )}
      </Panel>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader Icon={Library} tone="neutral" title="Actores e capacidades" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(j.actors ?? []).map((a) => <Pill key={a} className="bg-[#F4F1F1] text-[#6a5a5e]">{a}</Pill>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(j.capabilities ?? []).map((c) => <Pill key={c} className="bg-[#E8F0FD] text-blue-800">{c}</Pill>)}
          </div>
        </Panel>
        <Panel className="p-5">
          <SectionHeader Icon={Library} tone="neutral" title="Pré-condições" />
          <ul className="mt-3 space-y-1.5 text-[13px] text-[#1a1a1a]">
            {(j.preconditions ?? []).map((p, i) => <li key={i}>• {p}</li>)}
            {!(j.preconditions ?? []).length && <li className="text-[#a99a9e]">—</li>}
          </ul>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionHeader Icon={Library} tone="neutral" title={`Passos planeados (${(j.steps ?? []).length})`}
          subtitle="O que a execução FARIA. Nada aqui foi observado." />
        <ol className="mt-4 space-y-2.5">
          {(j.steps ?? []).map((st) => (
            <li key={st.seq} className="rounded-[12px] border border-[#f4e7e7] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-extrabold">
                  <span className="mr-2 font-mono text-[11.5px] text-[#a99a9e]">{String(st.seq).padStart(2, '0')}</span>
                  {st.action}
                </p>
                <Pill className={st.mutating ? 'bg-[#FBE9E9] text-[#9A1B22]' : 'bg-[#F4F1F1] text-[#6a5a5e]'}>
                  {st.mutating ? 'ALTERA ESTADO' : 'LEITURA'}
                </Pill>
              </div>
              <div className="mt-1.5 space-y-0.5 text-[12.5px]">
                {st.expect_api && <p><span className="text-[#9a8a8e]">API esperada: </span><span className="font-mono text-[12px]">{st.expect_api}</span></p>}
                {st.expect_ui && <p><span className="text-[#9a8a8e]">UI esperada: </span>{st.expect_ui}</p>}
                {!!(st.evidence ?? []).length && (
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[#9a8a8e]">Evidência: </span>
                    {st.evidence!.map((e) => <Pill key={e} className="bg-[#F4F1F1] text-[#6a5a5e]">{e}</Pill>)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel className="p-5">
        <SectionHeader Icon={ShieldCheck} tone="neutral" title={`Asserções (${(j.assertions ?? []).length})`}
          subtitle="Estas decidem o resultado — distintas dos passos." />
        <Why>
          Aparecem como EXPECTED porque nada as observou. Nenhuma mostra PASS antes de uma execução.
        </Why>
        <ul className="mt-3">
          {(j.assertions ?? []).map((a) => (
            <li key={a.id} className="flex items-start gap-3 border-b border-[#faf0f0] py-2.5 last:border-0">
              <Pill className={`${CHECK_STYLE[a.result]} mt-[1px] flex-none`}>{a.result}</Pill>
              <div>
                <p className="font-mono text-[11px] text-[#a99a9e]">{a.id} · {a.kind}{a.blocking ? ' · bloqueante' : ''}</p>
                <p className="text-[13px]">{a.describe}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader Icon={Library} tone="warn" title="Pode alterar" />
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {(j.state_changes ?? []).map((x, i) => <li key={i}>• {x}</li>)}
            {!(j.state_changes ?? []).length && <li className="text-[#a99a9e]">—</li>}
          </ul>
        </Panel>
        <Panel className="p-5">
          <SectionHeader Icon={ShieldCheck} tone="good" title="Não pode ser tocado" />
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {(j.preserved ?? []).map((x, i) => <li key={i}>• {x}</li>)}
            {!(j.preserved ?? []).length && <li className="text-[#a99a9e]">—</li>}
          </ul>
          <Why>História económica: preservada para sempre, nunca limpa entre execuções.</Why>
        </Panel>
      </div>
    </div>
  );
}
