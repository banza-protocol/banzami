'use client';

import { UsersRound, ShieldAlert } from 'lucide-react';
import { useStudio } from '../studio-context';
import { Panel, SectionHeader, Pill, Dot, Why, MetricCard, Field } from '../studio-ui';

const TYPE_LABEL: Record<string, string> = {
  consumer: 'Consumidor', business: 'Comerciante', developer: 'Programador', operator: 'Operador',
};

export default function ActorsPage() {
  const s = useStudio();
  const healthy = s.actors.filter((a) => a.status === 'provisioned').length;
  const byType = s.actors.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1; return acc;
  }, {});

  const journeysFor = (id: string) =>
    s.suites.flatMap((x) => x.journeys).filter((j) => (j.actors ?? []).includes(id)).map((j) => j.id);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard Icon={UsersRound} label="Total" value={s.actors.length} caption="no SANDBOX" />
        <MetricCard Icon={UsersRound} label="Provisionados" value={healthy} tone="good" caption={`${healthy}/${s.actors.length}`} />
        <MetricCard Icon={UsersRound} label="Degradados" value={s.actors.length - healthy}
          tone={s.actors.length - healthy ? 'warn' : 'neutral'} caption="fora de provisionado" />
        <MetricCard Icon={UsersRound} label="Tipos" tone="neutral"
          value={Object.keys(byType).length}
          caption={Object.entries(byType).map(([t, n]) => `${n} ${TYPE_LABEL[t] ?? t}`).join(' · ')} />
      </div>

      {/* The authority model, made readable. The 403 an operator may have seen is
          the model working, not a fault. */}
      <Panel className="p-5">
        <SectionHeader Icon={ShieldAlert} tone="warn"
          title="Autoridade de cenário ≠ autoridade de orquestração"
          subtitle="Porque o A01 vê o Studio mas não o opera." />
        <p className="mt-3 max-w-[820px] text-[13.5px] leading-[1.55] text-[#4a4a4a]">
          <strong>A01</strong> é um <em>actor de cenário</em>: age dentro de uma execução com a
          autoridade normal do produto — decisões canónicas de KYB e revisão. Não é a autoridade
          que controla o Studio.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-[13px] border border-green-200 bg-[#F4FBF6] px-4 py-3">
            <p className="text-[11.5px] font-black uppercase tracking-[0.05em] text-green-800">Pode</p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-green-900">
              <li>✓ acções canónicas de Compliance / KYB</li>
              <li>✓ <span className="font-mono text-[12px]">validation.view</span></li>
            </ul>
          </div>
          <div className="rounded-[13px] border border-red-200 bg-[#FDF3F3] px-4 py-3">
            <p className="text-[11.5px] font-black uppercase tracking-[0.05em] text-red-800">Não pode</p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-red-900">
              <li>✗ <span className="font-mono text-[12px]">validation.run</span> — preparar execuções</li>
              <li>✗ iniciar execuções</li>
              <li>✗ administrar operadores</li>
            </ul>
          </div>
        </div>
        <Why>
          Um actor que pudesse agendar a validação em que participa é um actor cujo PASS vale menos,
          porque nada fora do cenário decidiu que o cenário devia acontecer. A orquestração pertence
          ao SUPER_ADMIN humano, atrás de step-up. Uma tentativa do A01 de preparar uma execução
          recebe <span className="font-mono">403 FORBIDDEN</span> — evidência positiva do modelo,
          não um defeito.
        </Why>
      </Panel>

      <Panel className="p-5">
        <SectionHeader Icon={UsersRound} title="Actores de validação"
          subtitle="Cada actor indica QUAIS credenciais possui, pelo nome. Nunca o valor, nem a referência ao segredo." />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
              <tr>
                <th className="py-2 pr-4">ID</th><th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Identidade</th><th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Credenciais</th><th className="py-2 pr-4">Percursos</th>
                <th className="py-2">Função</th>
              </tr>
            </thead>
            <tbody>
              {s.actors.map((a) => {
                const js = journeysFor(a.id);
                return (
                  <tr key={a.id} className="border-b border-[#faf0f0] align-top">
                    <td className="py-2.5 pr-4 font-mono font-extrabold">{a.id}</td>
                    <td className="py-2.5 pr-4">{TYPE_LABEL[a.type] ?? a.type}</td>
                    <td className="py-2.5 pr-4 font-mono text-[12px]">{a.handle ? `@${a.handle}` : a.email ?? '—'}</td>
                    <td className="py-2.5 pr-4">
                      <Pill className={a.status === 'provisioned' ? 'bg-[#E9F7EE] text-green-800' : 'bg-[#FDF3E0] text-amber-900'}>
                        <Dot tone={a.status === 'provisioned' ? 'good' : 'warn'} />{a.status}
                      </Pill>
                    </td>
                    <td className="py-2.5 pr-4">
                      {a.credential_names.length
                        ? <span className="flex flex-wrap gap-1">{a.credential_names.map((n) => (
                            <Pill key={n} className="bg-[#F4F1F1] text-[#6a5a5e]">{n}</Pill>))}</span>
                        : <span className="text-[#a99a9e]">—</span>}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11.5px]">
                      {js.length ? js.join(', ') : <span className="text-[#a99a9e]">nenhum</span>}
                    </td>
                    <td className="py-2.5 max-w-[260px] text-[12px] text-[#6a5a5e]">{a.purpose ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
