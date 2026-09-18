'use client';

import { Boxes } from 'lucide-react';
import { useStudio } from '../studio-context';
import { Panel, SectionHeader, Pill, AsOf, Why, Hash } from '../studio-ui';

export default function ComponentsPage() {
  const s = useStudio();
  const components = s.overview?.components ?? [];

  return (
    <Panel className="p-5">
      <SectionHeader Icon={Boxes} title="Componentes participantes"
        subtitle="Revisões actualmente implantadas no SANDBOX." action={<AsOf live />} />
      <Why>
        Só componentes que realmente participam. Um mapa preenchido com todos os contentores da
        infraestrutura sugeriria que o Studio verifica mais do que verifica.
      </Why>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-[#f1e3e3] text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#a99a9e]">
            <tr>
              <th className="py-2 pr-4">Componente</th><th className="py-2 pr-4">Revisão implantada</th>
              <th className="py-2 pr-4">Fonte</th><th className="py-2 pr-4">Preparação</th>
              <th className="py-2 pr-4">Execução</th><th className="py-2">Responsabilidade</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <tr key={c.name} className="border-b border-[#faf0f0] align-top">
                <td className="py-2.5 pr-4 font-extrabold">{c.name}</td>
                <td className="py-2.5 pr-4">
                  {c.revision_known ? <Hash value={c.revision ?? ''} chars={14} />
                    : <span className="text-[12px] font-bold text-amber-700">não exposta em runtime</span>}
                </td>
                <td className="py-2.5 pr-4 text-[12px] text-[#9a8a8e]">{c.provenance_source}</td>
                <td className="py-2.5 pr-4">
                  {c.mandatory_for_preparation
                    ? <Pill className="bg-[#FBE9E9] text-[#9A1B22]">obrigatório</Pill>
                    : <span className="text-[#a99a9e]">—</span>}
                </td>
                <td className="py-2.5 pr-4">{c.exercised_at_execution ? 'sim' : '—'}</td>
                <td className="py-2.5 max-w-[320px] text-[12px] leading-[1.5] text-[#6a5a5e]">{c.responsibility}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Why>
        Um componente obrigatório que não consiga dizer a sua revisão impede a preparação de chegar
        a READY. Nunca é preenchido com o HEAD do repositório, e nunca é omitido para a tabela
        parecer completa.
      </Why>
    </Panel>
  );
}
