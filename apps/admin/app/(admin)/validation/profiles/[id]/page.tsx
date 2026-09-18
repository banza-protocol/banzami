'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileSliders, Layers, UsersRound, Boxes, ShieldCheck, AlertTriangle, Star } from 'lucide-react';
import { useStudio } from '../../studio-context';
import { formatKz } from '@/lib/format';
import {
  Panel, SectionHeader, Pill, Field, StatusPill, Why, Hash, Empty, Skeleton,
} from '../../studio-ui';

export default function ProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useStudio();

  if (s.loading) return <Skeleton className="h-[400px]" />;
  const p = (s.overview?.profiles ?? []).find((x) => x.id === id);
  if (!p) return <Panel className="p-6"><p className="text-[14px]">Perfil desconhecido: {id}</p></Panel>;

  const suites = s.suites.filter((x) => x.profiles.includes(p.id));
  const declared = suites.filter((x) => x.implementation_status === 'DECLARED');
  const journeys = suites.flatMap((x) => x.journeys);
  const actors = [...new Set(journeys.flatMap((j) => j.actors ?? []))].sort();
  const components = (s.overview?.components ?? []).filter((c) => c.mandatory_for_preparation);

  return (
    <div className="flex flex-col gap-[18px]">
      <button onClick={() => router.push('/validation/profiles')}
        className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#9a8a8e] hover:text-[#1a1a1a]">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todos os perfis
      </button>

      <Panel className="p-5">
        <SectionHeader Icon={p.id === 'GOLDEN' ? Star : Layers} tone={p.id === 'GOLDEN' ? 'warn' : 'neutral'}
          title={`${p.id} v${p.version}`} subtitle={p.name}
          action={<Hash value={p.digest} chars={16} />} />
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3.5 md:grid-cols-4">
          <Field label="Suites">{p.suites}</Field>
          <Field label="Bloqueantes">{p.blocking_suites}</Field>
          <Field label="Verificação mínima">
            <span className={p.minimum_preflight === 'HEALTHY' ? 'font-extrabold text-green-700' : 'font-extrabold text-amber-700'}>
              {p.minimum_preflight}
            </span>
          </Field>
          <Field label="PASS_WITH_RETRY">{p.max_pass_with_retry}</Field>
          <Field label="Tecto de volume">{formatKz(p.max_credit_volume_minor)}</Field>
          <Field label="Ambiente">SANDBOX</Field>
          <Field label="Percursos escritos">{journeys.length}</Field>
          <Field label="Actores envolvidos">{actors.length}</Field>
        </dl>
      </Panel>

      {/* The distinction the operator must not be able to miss: a profile
          CONTAINING 24 suites is not 24 suites having been executed. */}
      <Panel className="p-5">
        <SectionHeader Icon={Layers} tone="warn" title="Declarado ≠ executável ≠ executado"
          subtitle="O que este perfil selecciona, e o que disso existe realmente." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Suites seleccionadas', value: suites.length, tone: 'text-[#1a1a1a]',
              note: 'declaradas no perfil' },
            { label: 'Sem percurso executável', value: declared.length, tone: 'text-amber-700',
              note: 'nada há a executar' },
            { label: 'Percursos escritos', value: journeys.length, tone: 'text-[#1a1a1a]',
              note: 'com passos e asserções' },
            { label: 'Provados em execução', value: 0, tone: 'text-red-700',
              note: 'nenhuma execução correu' },
          ].map((m) => (
            <div key={m.label} className="rounded-[13px] border border-[#f4e7e7] bg-[#FFFCFC] px-4 py-3">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">{m.label}</p>
              <p className={`mt-1 text-[24px] font-black leading-none ${m.tone}`}>{m.value}</p>
              <p className="mt-1 text-[11.5px] text-[#a99a9e]">{m.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 h-[9px] w-full overflow-hidden rounded-full bg-[#F1EEEE]">
          <div className="h-full rounded-full bg-[#B5101F]"
            style={{ width: `${suites.length ? Math.round(((suites.length - declared.length) / suites.length) * 100) : 0}%` }} />
        </div>
        <Why>
          A barra mede quantas das suites seleccionadas têm pelo menos um percurso executável
          definido. Conter 24 suites não é ter executado 24 suites — e enquanto não existir motor
          de execução, a última coluna não pode deixar de ser zero.
        </Why>
      </Panel>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader Icon={ShieldCheck} tone="good" title="O que este perfil valida" />
          <p className="mt-3 text-[13px] leading-[1.6] text-[#1a1a1a]">{p.claim_pt ?? p.claim}</p>
        </Panel>
        <Panel className="p-5">
          <SectionHeader Icon={AlertTriangle} tone="warn" title="O que este perfil NÃO prova" />
          <ul className="mt-3 space-y-1.5 text-[13px] leading-[1.55] text-[#1a1a1a]">
            <li>• Nada foi executado: nenhuma execução GOLDEN ou FULL correu alguma vez.</li>
            <li>• {declared.length} das {suites.length} suites seleccionadas não têm percurso executável definido.</li>
            <li>• {journeys.length} percurso(s) estão escritos em todo o registo deste perfil.</li>
            <li>• Um PASS deste perfil não existe, e não pode existir enquanto não houver motor de execução.</li>
          </ul>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionHeader Icon={Layers} title={`Suites seleccionadas (${suites.length})`}
          subtitle="A vermelho, as bloqueantes: uma falha aqui reprova a execução." />
        <div className="mt-4 flex flex-wrap gap-1.5">
          {suites.map((x) => (
            <button key={x.id} onClick={() => router.push('/validation/registry')}
              className={`rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold ${
                x.blocking ? 'bg-[#FBE9E9] text-[#9A1B22]' : 'bg-[#F4F1F1] text-[#6a5a5e]'}`}
              title={`${x.name_pt} · ${x.implementation_status}`}>
              {x.id}
            </button>
          ))}
        </div>
        <Why>
          Um perfil pode promover uma suite a bloqueante; nunca despromover — não pode fazer com
          que uma invariante em falha deixe de contar.
        </Why>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
              <tr><th className="py-2 pr-4">ID</th><th className="py-2 pr-4">Suite</th>
                <th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Percursos</th><th className="py-2">Bloqueante</th></tr>
            </thead>
            <tbody>
              {suites.map((x) => (
                <tr key={x.id} className="border-b border-[#faf0f0]">
                  <td className="py-2 pr-4 font-mono font-extrabold">{x.id}</td>
                  <td className="py-2 pr-4">{x.name_pt}</td>
                  <td className="py-2 pr-4"><StatusPill status={x.implementation_status} /></td>
                  <td className="py-2 pr-4">{x.journeys.length}</td>
                  <td className="py-2">{x.blocking ? 'sim' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader Icon={UsersRound} tone="neutral" title="Actores envolvidos"
            subtitle="Derivados dos percursos realmente definidos." />
          {actors.length === 0 ? (
            <div className="mt-4"><Empty title="Nenhum actor envolvido"
              detail="Nenhum percurso deste perfil nomeia actores, porque quase nenhum percurso está escrito." /></div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {actors.map((a) => <Pill key={a} className="bg-[#F4F1F1] text-[#6a5a5e]">{a}</Pill>)}
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <SectionHeader Icon={Boxes} tone="neutral" title="Componentes obrigatórios"
            subtitle="Sem a revisão de todos, a preparação não chega a READY." />
          <ul className="mt-3">
            {components.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 border-b border-[#faf0f0] py-2 last:border-0">
                <span className="text-[13px] font-extrabold">{c.name}</span>
                {c.revision_known ? <Hash value={c.revision ?? ''} />
                  : <span className="text-[12px] font-bold text-amber-700">indisponível</span>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
