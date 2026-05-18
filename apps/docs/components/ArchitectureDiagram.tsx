import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export function ArchitectureDiagram({ children }: Props) {
  return (
    <div className="my-6 overflow-x-auto rounded-xl border border-banzami-200 bg-slate-950 shadow-lg">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2">
        <span className="h-3 w-3 rounded-full bg-red-500" />
        <span className="h-3 w-3 rounded-full bg-yellow-400" />
        <span className="h-3 w-3 rounded-full bg-green-500" />
        <span className="ml-2 font-mono text-xs text-slate-500">architecture</span>
      </div>
      <pre className="overflow-x-auto p-6 font-mono text-sm leading-relaxed text-banzami-300">
        {children}
      </pre>
    </div>
  )
}
