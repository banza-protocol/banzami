'use client';

/**
 * The Validation Actor registry.
 *
 * Two things this page must make unmistakable: what each actor IS in the
 * product, and what it is ALLOWED to do in the Studio. They are different
 * powers, and the operator actor is precisely where they diverge.
 */

import { useState } from 'react';
import {
  UsersRound, ShieldAlert, ShieldCheck, ChevronRight, ChevronDown, Wallet, Store, Code2, UserCog,
} from 'lucide-react';
import { useStudio } from '../studio-context';
import type { ValidationActor } from '@/lib/admin-api';
import { Panel, SectionHeader, Pill, Dot, Why, MetricCard, Field, Empty, Hash } from '../studio-ui';

const TYPE_LABEL: Record<string, string> = {
  consumer: 'Consumidor', business: 'Comerciante', developer: 'Programador', operator: 'Operador',
};
const TYPE_ICON = { consumer: Wallet, business: Store, developer: Code2, operator: UserCog } as const;

/** What each actor type may do in the STUDIO, as opposed to in the product.
 *  Derived from the canonical authority decision (doc 31), not invented here. */
const STUDIO_AUTHORITY: Record<string, { can: string[]; cannot: string[] }> = {
  operator: {
    can: ['validation.view — ler o Studio', 'acções canónicas de Compliance / KYB num cenário'],
    cannot: ['validation.run — preparar execuções', 'iniciar execuções', 'administrar operadores'],
  },
  consumer: { can: ['participar num cenário como pagador ou destinatário'], cannot: ['qualquer acesso ao Studio'] },
  business: { can: ['participar num cenário como comerciante'], cannot: ['qualquer acesso ao Studio'] },
  developer: { can: ['participar num cenário através da Consola de programador'], cannot: ['qualquer acesso ao Studio'] },
};

export default function ActorsPage() {
  const s = useStudio();
  const [open, setOpen] = useState<string | null>(null);

  const healthy = s.actors.filter((a) => a.status === 'provisioned').length;
  const count = (t: string) => s.actors.filter((a) => a.type === t).length;

  const journeysFor = (id: string) =>
    s.suites.flatMap((x) => x.journeys).filter((j) => (j.actors ?? []).includes(id));
  const profilesFor = (id: string) => {
    const suiteIDs = new Set(journeysFor(id).map((j) => j.suite));
    return [...new Set(s.suites.filter((x) => suiteIDs.has(x.id)).flatMap((x) => x.profiles))].sort();
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard Icon={UsersRound} label="Total" value={s.actors.length} caption="no SANDBOX" />
        <MetricCard Icon={ShieldCheck} tone={healthy === s.actors.length ? 'good' : 'warn'}
          label="Provisionados" value={`${healthy}/${s.actors.length}`} caption="estado do registo" />
        <MetricCard Icon={Wallet} tone="neutral" label="Consumidores" value={count('consumer')} caption="pagadores e destinatários" />
        <MetricCard Icon={Store} tone="neutral" label="Comerciantes" value={count('business')} caption="recebem e liquidam" />
        <MetricCard Icon={Code2} tone="neutral" label="Programadores" value={count('developer')} caption="Consola e chaves" />
        <MetricCard Icon={UserCog} tone="neutral" label="Operadores" value={count('operator')} caption="decisões de Compliance" />
      </div>

      <Panel className="p-5">
        <SectionHeader Icon={ShieldAlert} tone="warn"
          title="Autoridade de cenário ≠ autoridade de orquestração"
          subtitle="Porque o A01 vê o Studio mas não o opera." />
        <p className="mt-3 max-w-[860px] text-[13px] leading-[1.55] text-[#4a4a4a]">
          <strong>A01</strong> é um <em>actor de cenário</em>: age dentro de uma execução com a
          autoridade normal do produto. Não é a autoridade que controla o Studio.
        </p>
        <Why>
          Um actor que pudesse agendar a validação em que participa é um actor cujo PASS vale
          menos, porque nada fora do cenário decidiu que o cenário devia acontecer. A orquestração
          pertence ao SUPER_ADMIN humano, atrás de step-up. Uma tentativa do A01 de preparar uma
          execução recebe <span className="font-mono">403 FORBIDDEN</span> — evidência positiva do
          modelo, não um defeito.
        </Why>
      </Panel>

      <Panel className="p-5">
        <SectionHeader Icon={UsersRound} title={`Actores (${s.actors.length})`}
          subtitle="Cada actor indica QUAIS credenciais possui, pelo nome. Nunca o valor, nem a referência ao segredo." />

        <ul className="mt-4">
          {s.actors.map((a) => {
            const js = journeysFor(a.id);
            const ps = profilesFor(a.id);
            const isOpen = open === a.id;
            const Icon = TYPE_ICON[a.type as keyof typeof TYPE_ICON] ?? UsersRound;
            return (
              <li key={a.id} className="border-b border-[#faf0f0] last:border-0">
                <button onClick={() => setOpen(isOpen ? null : a.id)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-[#FFFCFC]">
                  <Icon className="h-[17px] w-[17px] flex-none text-[#9a8a8e]" strokeWidth={1.9} aria-hidden />
                  <span className="w-[46px] flex-none font-mono text-[13px] font-extrabold">{a.id}</span>
                  <span className="w-[104px] flex-none text-[12.5px] text-[#6a5a5e]">{TYPE_LABEL[a.type] ?? a.type}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[#6a5a5e]">
                    {a.handle ? `@${a.handle}` : a.email ?? '—'}
                  </span>
                  <Pill className={a.status === 'provisioned' ? 'bg-[#E9F7EE] text-green-800' : 'bg-[#FDF3E0] text-amber-900'}>
                    <Dot tone={a.status === 'provisioned' ? 'good' : 'warn'} />{a.status}
                  </Pill>
                  <span className="w-[86px] flex-none text-right text-[11.5px] text-[#a99a9e]">
                    {js.length ? `${js.length} percursos` : 'sem percurso'}
                  </span>
                  {isOpen ? <ChevronDown className="h-4 w-4 flex-none text-[#cbbaba]" aria-hidden />
                          : <ChevronRight className="h-4 w-4 flex-none text-[#cbbaba]" aria-hidden />}
                </button>

                {isOpen && (
                  <div className="grid gap-4 pb-4 pl-[38px] lg:grid-cols-3">
                    <div>
                      <dl className="space-y-2.5">
                        <Field label="Nome no Studio">{a.display_name}</Field>
                        <Field label="Ciclo de vida">{a.lifecycle ?? '—'}</Field>
                        <Field label="Provisionado em">{a.provisioned_at ?? '—'}</Field>
                        <Field label="Credenciais">
                          {a.credential_names.length
                            ? <span className="flex flex-wrap gap-1">{a.credential_names.map((n) => (
                                <Pill key={n} className="bg-[#F4F1F1] text-[#6a5a5e]">{n}</Pill>))}</span>
                            : <span className="text-[#a99a9e]">nenhuma registada</span>}
                        </Field>
                      </dl>
                    </div>

                    <div>
                      <p className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
                        Recursos de produto
                      </p>
                      <ul className="mt-2 space-y-1">
                        {Object.entries(a.product_ids ?? {}).map(([k, v]) => (
                          <li key={k} className="flex items-baseline justify-between gap-3">
                            <span className="text-[12px] text-[#6a5a5e]">{k}</span>
                            <Hash value={v} chars={10} />
                          </li>
                        ))}
                        {!Object.keys(a.product_ids ?? {}).length && (
                          <li className="text-[12px] text-[#a99a9e]">nenhum registado</li>
                        )}
                      </ul>
                      <p className="mt-3 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
                        Onde participa
                      </p>
                      <p className="mt-1 text-[12.5px]">
                        {ps.length ? `Perfis: ${ps.join(', ')}` : 'Nenhum perfil o exercita hoje.'}
                      </p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-[#6a5a5e]">
                        {js.length ? js.map((j) => j.id).join(', ') : '—'}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <div className="rounded-[11px] border border-green-200 bg-[#F4FBF6] px-3.5 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.05em] text-green-800">Pode</p>
                        <ul className="mt-1 space-y-0.5 text-[12px] text-green-900">
                          {(STUDIO_AUTHORITY[a.type]?.can ?? []).map((x) => <li key={x}>✓ {x}</li>)}
                        </ul>
                      </div>
                      <div className="rounded-[11px] border border-red-200 bg-[#FDF3F3] px-3.5 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.05em] text-red-800">Não pode</p>
                        <ul className="mt-1 space-y-0.5 text-[12px] text-red-900">
                          {(STUDIO_AUTHORITY[a.type]?.cannot ?? []).map((x) => <li key={x}>✗ {x}</li>)}
                        </ul>
                      </div>
                      {a.purpose && (
                        <p className="text-[12px] leading-[1.5] text-[#6a5a5e]">{a.purpose}</p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {s.actors.length === 0 && (
          <div className="mt-4"><Empty title="Nenhum actor registado" detail="O registo de actores está vazio." /></div>
        )}
      </Panel>
    </div>
  );
}
