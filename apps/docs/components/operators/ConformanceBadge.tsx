import { BADGE_CONFIG, CERTIFICATION_LEVEL_LABELS, type ConformanceBadge } from '@/lib/operators'

interface LevelBadgeProps {
  level: number
}

export function CertificationLevelBadge({ level }: LevelBadgeProps) {
  const cfg = CERTIFICATION_LEVEL_LABELS[level] ?? CERTIFICATION_LEVEL_LABELS[0]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className="font-mono font-bold">L{level}</span>
      <span>{cfg.name.split(' — ')[1]}</span>
    </span>
  )
}

interface ConformanceBadgeProps {
  badge: ConformanceBadge
}

export function ConformanceBadgeChip({ badge }: ConformanceBadgeProps) {
  const cfg = BADGE_CONFIG[badge]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
        <path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {cfg.label}
    </span>
  )
}
