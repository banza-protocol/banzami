import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

export function ASCIIDiagramBlock({ children, label }: Props) {
  return (
    <div className="my-8 overflow-hidden rounded-2xl border border-bz-text/10 bg-bz-text shadow-card-lg">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        <span className="ml-3 font-mono text-[10px] font-medium tracking-wider text-white/30 uppercase">
          {label ?? 'arquitectura'}
        </span>
      </div>
      <pre className="overflow-x-auto p-6 font-mono text-sm leading-relaxed text-bz-gold/90 architecture-diagram">
        {children}
      </pre>
    </div>
  )
}
