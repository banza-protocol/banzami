'use client';

import { ShieldCheck, AlertTriangle, CircleSlash } from 'lucide-react';
import { useStudio } from '../studio-context';
import { formatKz, formatDateTime } from '@/lib/format';
import type { ValidationCheck } from '@/lib/admin-api';
import { Panel, SectionHeader, Pill, Button, AsOf, Why, Skeleton, CHECK_STYLE, VERDICT_SKIN } from '../studio-ui';

const GROUP_LABEL: Record<string, string> = {
  registry: 'Registo', provenance: 'Proveniência', actors: 'Actores',
  budget: 'Capacidade e quota', studio: 'Esquema do Studio', database: 'Base de dados',
};

export default function PreflightPage() {
  const s = useStudio();
  const pf = s.preflight;
  const profiles = s.overview?.profiles ?? [];

  if (!pf) {
    return (
      <Panel className="p-6">
        <SectionHeader Icon={ShieldCheck} title="Verificação prévia"
          subtitle="Ainda não foi medida nesta sessão." />
        <div className="mt-4">
          <Button variant="primary" disabled={s.busy} onClick={() => void s.runPreflight('GOLDEN')}>
            Medir agora (GOLDEN)
          </Button>
        </div>
        {s.busy && <Skeleton className="mt-4 h-[200px]" />}
      </Panel>
    );
  }

  const groups = [...new Set(pf.checks.map((c) => c.group))];
  const Icon = pf.verdict === 'HEALTHY' ? ShieldCheck : pf.verdict === 'DEGRADED' ? AlertTriangle : CircleSlash;

  return (
    <div className="flex flex-col gap-[18px]">
      <Panel className="p-5">
        <SectionHeader Icon={ShieldCheck} tone={pf.verdict === 'HEALTHY' ? 'good' : 'warn'}
          title="Verificação prévia" subtitle="Se o laboratório está apto a ser usado."
          action={<AsOf live />} />
        <div className={`mt-4 flex items-start gap-3 rounded-[14px] border-[1.5px] px-5 py-4 ${VERDICT_SKIN[pf.verdict]}`}>
          <Icon className="mt-0.5 h-5 w-5 flex-none" aria-hidden />
          <div>
            <p className="text-[15px] font-black">{pf.verdict}</p>
            <p className="mt-1 text-[13px]">
              {s.meetsMinimum === null ? 'Medição sem perfil.'
                : s.meetsMinimum ? `Satisfaz o mínimo exigido por ${s.preflightProfile}.`
                : `NÃO satisfaz o mínimo exigido por ${s.preflightProfile}.`}
            </p>
          </div>
        </div>
        <Why>
          O vocabulário é deliberadamente distinto do de uma execução (PASS/FAIL): uma falha de
          infraestrutura nunca deve ser lida como um defeito do produto. Esta medição não escreveu
          nada, não autenticou ninguém e não gastou orçamento. {formatDateTime(pf.ended_at)}
        </Why>
        <div className="mt-4 flex gap-2">
          {profiles.map((p) => (
            <Button key={p.id} disabled={s.busy} onClick={() => void s.runPreflight(p.id)}>
              Medir para {p.id}
            </Button>
          ))}
        </div>
      </Panel>

      {groups.map((g) => (
        <Panel key={g} className="p-5">
          <SectionHeader Icon={ShieldCheck} tone="neutral" title={GROUP_LABEL[g] ?? g}
            subtitle={`${pf.checks.filter((c) => c.group === g).length} verificações`} />
          <ul className="mt-3">
            {pf.checks.filter((c) => c.group === g).map((c) => (
              <CheckRow key={`${c.group}.${c.id}`} c={c}
                ceilings={Object.fromEntries(profiles.map((p) => [p.id, p.max_credit_volume_minor]))} />
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

function CheckRow({ c, ceilings }: { c: ValidationCheck; ceilings: Record<string, number> }) {
  const m = c.measured ?? {};
  const budget = m.limit_minor !== undefined && m.headroom_minor !== undefined;
  return (
    <li className="border-b border-[#faf0f0] py-3 last:border-0">
      <div className="flex items-start gap-3">
        <Pill className={`${CHECK_STYLE[c.status]} mt-[1px] flex-none`}>{c.status}</Pill>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11.5px] text-[#a99a9e]">{c.group}/{c.id}</p>
          <p className="text-[13.5px] text-[#1a1a1a]">{c.detail}</p>

          {budget && (
            <table className="mt-2 text-[12.5px]">
              <tbody>
                <tr><td className="pr-8 text-[#9a8a8e]">Usado</td><td className="font-mono">{formatKz(m.used_minor ?? 0)}</td></tr>
                <tr><td className="pr-8 text-[#9a8a8e]">Limite</td><td className="font-mono">{formatKz(m.limit_minor!)}</td></tr>
                <tr><td className="pr-8 text-[#9a8a8e]">Folga</td><td className="font-mono font-extrabold">{formatKz(m.headroom_minor!)}</td></tr>
                {Object.entries(ceilings).map(([id, ceiling]) => (
                  <tr key={id}>
                    <td className="pr-8 text-[#9a8a8e]">Tecto {id}</td>
                    <td className="font-mono">
                      {formatKz(ceiling)}
                      {m.headroom_minor! < ceiling
                        ? <span className="ml-2 font-extrabold text-red-700">não cabe</span>
                        : <span className="ml-2 text-green-700">cabe</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!budget && Object.keys(m).length > 0 && (
            <p className="mt-1 font-mono text-[11.5px] text-[#6a5a5e]">
              {Object.entries(m).map(([k, v]) => `${k}=${v}`).join('   ')}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
