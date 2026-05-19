import type { ValidationEvidence as EvidenceType, EvidenceType as EvidenceKind } from '@/lib/validation-types'

const iconMap: Record<EvidenceKind, string> = {
  route:              '⟶',
  api_endpoint:       '⬡',
  component:          '◈',
  test_file:          '✓',
  screenshot:         '◻',
  migration:          '⤓',
  sdk_method:         '◆',
  architecture_module:'⬡',
  webhook:            '⚡',
  manual_qa:          '◉',
  adr:                '§',
  config:             '⚙',
}

const labelMap: Record<EvidenceKind, string> = {
  route:              'Rota',
  api_endpoint:       'API',
  component:          'Componente',
  test_file:          'Teste',
  screenshot:         'Screenshot',
  migration:          'Migração',
  sdk_method:         'SDK',
  architecture_module:'Módulo',
  webhook:            'Webhook',
  manual_qa:          'QA manual',
  adr:                'ADR',
  config:             'Config',
}

interface Props {
  evidence: EvidenceType[]
}

export function ValidationEvidence({ evidence }: Props) {
  if (evidence.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-bz-border px-2 py-0.5 font-mono text-[10px] text-bz-muted">
        sem evidência
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {evidence.map((ev, i) => (
        <span
          key={i}
          title={ev.ref ?? ev.label}
          className="inline-flex items-center gap-1 rounded-md border border-bz-border bg-bz-surface px-2 py-0.5 font-mono text-[10px] text-bz-text"
        >
          <span className="text-bz-muted">{iconMap[ev.type]}</span>
          <span className="text-[9px] font-bold text-bz-muted uppercase tracking-wider">{labelMap[ev.type]}</span>
          <span className="max-w-[120px] truncate">{ev.label}</span>
        </span>
      ))}
    </div>
  )
}
