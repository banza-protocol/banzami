'use client'

import Link from 'next/link'
import { type ModuleId } from './BanzamIAApp'
import { BanzamIAIcon } from './BanzamIAIcon'

interface Props {
  active: ModuleId
  onSelect: (id: ModuleId) => void
  mode: 'demo' | 'live'
}

const MODULES: Array<{ id: ModuleId; label: string; icon: React.ReactNode; liveOnly?: boolean }> = [
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <path d="M2 4h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 2V5a1 1 0 011-1z"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    ),
  },
  {
    id: 'operator-builder',
    label: 'Operator Builder',
    icon: (
      <>
        <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M9 11.5h5M11.5 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    id: 'conformance',
    label: 'Conformance',
    icon: (
      <>
        <path d="M3 8l2.5 2.5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </>
    ),
  },
  {
    id: 'manifest',
    label: 'Manifest Validator',
    icon: (
      <path d="M3 3h10M3 7h10M3 11h6M11 9l3 3-3 3"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ),
  },
  {
    id: 'trace',
    label: 'Trace Explainer',
    icon: (
      <>
        <path d="M2 8h12M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </>
    ),
  },
  {
    id: 'sdk',
    label: 'SDK Assistant',
    icon: (
      <path d="M3 5l3 3-3 3M8 11h5"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ),
  },
  {
    id: 'rfc-explorer',
    label: 'RFC / ADR Explorer',
    icon: (
      <path d="M4 2h6l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zM9 2v5h5"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    ),
  },
  {
    id: 'knowledge',
    label: 'Knowledge Search',
    icon: (
      <>
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    id: 'status',
    label: 'System Status',
    icon: (
      <>
        <path d="M2 11h2l2-6 3 8 2-4 1 2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  {
    id: 'graph-explorer',
    label: 'Protocol Graph',
    icon: (
      <>
        <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="5.8" y1="7" x2="10.2" y2="4.8" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="5.8" y1="9" x2="10.2" y2="11.2" stroke="currentColor" strokeWidth="1.5"/>
      </>
    ),
  },
  {
    id: 'research',
    label: 'Protocol Research',
    icon: (
      <>
        <circle cx="7" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M10 9l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M3 13h4M3 11h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </>
    ),
  },
  {
    id: 'certification-copilot',
    label: 'Cert. Copilot',
    icon: (
      <>
        <path d="M8 2L4 4v4c0 3 1.8 5.7 4 6.5C10.2 13.7 12 11 12 8V4L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
        <path d="M6 8l1.5 1.5L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </>
    ),
  },
  {
    id: 'quality',
    label: 'Quality Dashboard',
    icon: (
      <>
        <rect x="2" y="10" width="3" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="6.5" y="6" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="11" y="2" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </>
    ),
  },
  {
    id: 'simulator',
    label: 'Protocol Simulator',
    icon: (
      <>
        <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M11 5l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </>
    ),
  },
  {
    id: 'federation',
    label: 'Federation Intel.',
    icon: (
      <>
        <circle cx="4" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M6.5 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M4 4V2M12 4V2M4 12v2M12 12v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </>
    ),
  },
  {
    id: 'memory',
    label: 'Protocol Memory',
    icon: (
      <>
        <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M12 10.5V12l1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </>
    ),
  },
  {
    id: 'digital-twin',
    label: 'Digital Twin',
    icon: (
      <>
        <rect x="2" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="9" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M7 6h2M7 8h2M7 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </>
    ),
  },
]

export function BanzamIASidebar({ active, onSelect, mode }: Props) {
  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-bia-border bg-bia-surface-2">
      {/* Logo area */}
      <div className="flex h-14 items-center gap-2.5 border-b border-bia-border px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bia-primary shadow-bia-glow">
          <BanzamIAIcon size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight text-bia-text">BanzAI</div>
          <div className="text-[10px] text-bia-muted leading-none">Protocol Operating System</div>
        </div>
      </div>

      {/* Mode badge */}
      <div className="px-3 py-2.5">
        <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
          mode === 'live'
            ? 'bg-green-50 text-bia-green border border-green-200'
            : 'bg-amber-50 text-bia-amber border border-amber-200'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${mode === 'live' ? 'bg-bia-green animate-pulse' : 'bg-bia-amber'}`} />
          {mode === 'live' ? 'Live — API connected' : 'Demo mode'}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {MODULES.map(mod => {
          const isActive = active === mod.id
          return (
            <button
              key={mod.id}
              onClick={() => onSelect(mod.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 mb-0.5 text-left text-sm transition-all ${
                isActive
                  ? 'bg-bia-primary text-white shadow-sm'
                  : 'text-bia-muted hover:bg-white hover:text-bia-text'
              }`}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
                {mod.icon}
              </svg>
              <span className="truncate font-medium">{mod.label}</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-bia-border p-3 space-y-2">
        <Link
          href="/sobre-banzamia"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-bia-muted hover:bg-white hover:text-bia-text transition-colors"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 7v5M8 5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Sobre o BanzAI
        </Link>
        <div className="rounded-lg bg-bz-primary/5 border border-bz-primary/10 px-3 py-2">
          <p className="text-[10px] text-bia-muted leading-relaxed italic">
            Tools determine truth.<br />AI explains truth.
          </p>
        </div>
      </div>
    </aside>
  )
}
