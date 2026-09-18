'use client';

import { useRouter } from 'next/navigation';
import { FileSliders, ChevronRight, Star, Layers } from 'lucide-react';
import { useStudio } from '../studio-context';
import { formatKz } from '@/lib/format';
import { Panel, SectionHeader, IconChip, Pill, Row, Why, Hash } from '../studio-ui';

export default function ProfilesPage() {
  const s = useStudio();
  const router = useRouter();
  const profiles = s.overview?.profiles ?? [];

  return (
    <div className="flex flex-col gap-[18px]">
      <Panel className="p-5">
        <SectionHeader Icon={FileSliders} title={`Perfis (${profiles.length})`}
          subtitle="Um perfil decide quanto dinheiro real se move e o que um PASS permitiria afirmar." />
        <Why>
          Vivem em quality/validation/profiles.yaml, revistos como código. Uma execução fixa o id,
          a versão e o digest do perfil, por isso editá-lo depois não pode redescrever uma execução
          que já aconteceu.
        </Why>
      </Panel>

      <div className="grid gap-[18px] lg:grid-cols-2">
        {profiles.map((p) => (
          <Panel key={p.id} className="p-5" onClick={() => router.push(`/validation/profiles/${p.id}`)}>
            <SectionHeader Icon={p.id === 'GOLDEN' ? Star : Layers} tone={p.id === 'GOLDEN' ? 'warn' : 'neutral'}
              title={`${p.id} v${p.version}`} subtitle={p.name_pt}
              action={<ChevronRight className="h-5 w-5 text-[#cbbaba]" aria-hidden />} />
            <p className="mt-3 text-[12.5px] leading-[1.5] text-[#6a5a5e]">{p.claim}</p>
            <dl className="mt-3 border-t border-[#f4e7e7] pt-2">
              <Row label="Suites" value={`${p.suites} (${p.blocking_suites} bloqueantes)`} />
              <Row label="Verificação mínima" value={p.minimum_preflight} />
              <Row label="Tecto de volume" value={formatKz(p.max_credit_volume_minor)} />
              <Row label="PASS_WITH_RETRY" value={p.max_pass_with_retry} />
              <Row label="Digest" value={<Hash value={p.digest} />} />
            </dl>
          </Panel>
        ))}
      </div>
    </div>
  );
}
