import type { AuditTrailEntry } from '@/lib/operators'

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  initial_registration: {
    color: 'text-green-700', bg: 'bg-green-100',
    icon: <path d="M6 3v6M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  },
  conformance_update: {
    color: 'text-blue-700', bg: 'bg-blue-100',
    icon: <path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  },
  capability_added: {
    color: 'text-bz-primary', bg: 'bg-bz-primary-light',
    icon: <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  },
  key_rotation: {
    color: 'text-amber-700', bg: 'bg-amber-100',
    icon: <><path d="M6 10a4 4 0 100-8 4 4 0 000 8z" /><path d="M9.5 7L14 11.5" strokeLinecap="round" /></>,
  },
  protocol_upgrade: {
    color: 'text-purple-700', bg: 'bg-purple-100',
    icon: <path d="M3 8l3-3 3 3M6 5v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  },
}

const DEFAULT_EVENT = {
  color: 'text-bz-muted', bg: 'bg-bz-surface',
  icon: <circle cx="6" cy="6" r="3" fill="currentColor" />,
}

interface Props {
  entries: AuditTrailEntry[]
}

export function OperatorTimeline({ entries }: Props) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="relative space-y-0">
      {sorted.map((entry, i) => {
        const cfg = EVENT_CONFIG[entry.event] ?? DEFAULT_EVENT
        const isLast = i === sorted.length - 1

        return (
          <div key={i} className="relative flex gap-4 pb-6">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-bz-border" />
            )}

            {/* Icon */}
            <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
              <svg className={`h-4 w-4 ${cfg.color}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                {cfg.icon}
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 pt-0.5">
              <p className="text-sm font-medium text-bz-text">{entry.description}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-[11px] text-bz-muted">{entry.date}</span>
                <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${cfg.color} ${cfg.bg}`}>
                  {entry.event.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
