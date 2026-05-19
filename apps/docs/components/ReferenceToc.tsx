'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  sections: ReferenceSection[]
}

function useActiveSection(sections: ReferenceSection[]) {
  const [activeId, setActiveId] = useState(`section-${sections[0]?.number ?? 1}`)

  useEffect(() => {
    // Honour hash on initial load
    const hash = window.location.hash.slice(1)
    if (hash.startsWith('section-')) setActiveId(hash)

    const update = () => {
      let current = `section-${sections[0]?.number ?? 1}`
      for (const s of sections) {
        const el = document.getElementById(`section-${s.number}`)
        if (el && el.getBoundingClientRect().top <= 120) current = `section-${s.number}`
      }
      setActiveId(current)
    }

    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [sections])

  return activeId
}

export function ReferenceToc({ sections }: Props) {
  const activeId = useActiveSection(sections)
  const navRef = useRef<HTMLElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll the TOC sidebar to keep the active item visible
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
  }

  return (
    <aside
      ref={navRef}
      className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 overflow-y-auto border-r border-bz-border bg-white px-3 py-5 xl:block"
    >
      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-bz-muted">
        Índice
      </div>
      <nav className="flex flex-col gap-0.5">
        {sections.map((s) => {
          const id = `section-${s.number}`
          const active = activeId === id
          return (
            <button
              key={s.id}
              ref={active ? activeRef : undefined}
              onClick={() => go(id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-all duration-150 ${
                active
                  ? 'bg-bz-primary-light font-semibold text-bz-primary'
                  : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
              }`}
            >
              <span
                className={`w-4 shrink-0 font-mono text-[9px] transition-colors ${
                  active ? 'text-bz-primary' : 'text-bz-border'
                }`}
              >
                {s.number}.
              </span>
              <span className="line-clamp-1">{s.title}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
