'use client'

import { useEffect, useState } from 'react'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  sections: ReferenceSection[]
}

export function ReferenceMobileToc({ sections }: Props) {
  const [activeId, setActiveId] = useState(`section-${sections[0]?.number ?? 1}`)

  useEffect(() => {
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

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
    setActiveId(id)
  }

  return (
    <details className="mb-10 rounded-2xl border border-bz-border bg-white p-5 xl:hidden">
      <summary className="cursor-pointer text-sm font-semibold text-bz-text">
        Índice ({sections.length} secções)
      </summary>
      <ol className="mt-4 grid gap-1 sm:grid-cols-2">
        {sections.map((s) => {
          const id = `section-${s.number}`
          const active = activeId === id
          return (
            <li key={s.id}>
              <button
                onClick={() => go(id)}
                className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm transition-all duration-150 ${
                  active
                    ? 'font-semibold text-bz-primary'
                    : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
                }`}
              >
                <span
                  className={`shrink-0 font-mono text-[10px] transition-colors ${
                    active ? 'text-bz-primary' : 'text-bz-border'
                  }`}
                >
                  {s.number}.
                </span>
                {s.title}
              </button>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
