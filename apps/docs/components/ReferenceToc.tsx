'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  sections: ReferenceSection[]
}

export function ReferenceToc({ sections }: Props) {
  const [activeSectionId, setActiveSectionId] = useState(`section-${sections[0]?.number ?? 1}`)
  const [activeSubAnchor, setActiveSubAnchor] = useState('')
  const activeSubRef = useRef<HTMLButtonElement>(null)
  const sidebarRef   = useRef<HTMLElement>(null)

  // Track active H2 section on scroll
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash.startsWith('section-')) setActiveSectionId(hash)

    const update = () => {
      let current = `section-${sections[0]?.number ?? 1}`
      for (const s of sections) {
        const el = document.getElementById(`section-${s.number}`)
        if (el && el.getBoundingClientRect().top <= 120) current = `section-${s.number}`
      }
      setActiveSectionId(current)
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [sections])

  // Track active H3 subsection on scroll — re-runs when active section changes
  useEffect(() => {
    const num = parseInt(activeSectionId.replace('section-', ''))
    const subs = sections.find(s => s.number === num)?.subsections ?? []
    setActiveSubAnchor(subs[0]?.anchor ?? '')
    if (!subs.length) return

    const update = () => {
      let current = subs[0].anchor
      for (const sub of subs) {
        const el = document.getElementById(sub.anchor)
        if (el && el.getBoundingClientRect().top <= 120) current = sub.anchor
      }
      setActiveSubAnchor(current)
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [activeSectionId, sections])

  // Scroll within the sidebar only — never let scrollIntoView touch the page.
  // (scrollIntoView on a sticky container's child uses the element's natural
  // document position, which can yank the user back to the top of the page.)
  useEffect(() => {
    const sidebar = sidebarRef.current
    const btn     = activeSubRef.current
    if (!sidebar || !btn) return
    const sr = sidebar.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    if (br.top < sr.top + 16) {
      sidebar.scrollBy({ top: br.top - sr.top - 16, behavior: 'smooth' })
    } else if (br.bottom > sr.bottom - 16) {
      sidebar.scrollBy({ top: br.bottom - sr.bottom + 16, behavior: 'smooth' })
    }
  }, [activeSubAnchor])

  const activeSection = sections.find(s => `section-${s.number}` === activeSectionId)
  const subsections = activeSection?.subsections ?? []

  const goToSub = (anchor: string) => {
    const el = document.getElementById(anchor)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${anchor}`)
    setActiveSubAnchor(anchor)
  }

  return (
    <aside ref={sidebarRef} className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 overflow-y-auto border-r border-bz-border bg-white px-3 py-5 xl:block">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-bz-muted">
        Índice
      </div>

      {activeSection && (
        <div className="mb-3 border-l-2 border-bz-primary pl-3">
          <div className="font-mono text-[9px] text-bz-primary">§{activeSection.number}</div>
          <div className="text-[11px] font-semibold leading-tight text-bz-text">
            {activeSection.title}
          </div>
        </div>
      )}

      {subsections.length > 0 ? (
        <nav className="flex flex-col gap-0.5">
          {subsections.map((sub) => {
            const active = activeSubAnchor === sub.anchor
            const numPrefix = sub.title.match(/^(\d+\.\d+)\s*/)?.[1]
            const label = sub.title.replace(/^\d+\.\d+\s*/, '')
            return (
              <button
                key={sub.id}
                ref={active ? activeSubRef : undefined}
                onClick={() => goToSub(sub.anchor)}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-all duration-150 ${
                  active
                    ? 'bg-bz-primary-light font-semibold text-bz-primary'
                    : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
                }`}
              >
                {numPrefix && (
                  <span className={`mt-px shrink-0 font-mono text-[9px] transition-colors ${active ? 'text-bz-primary' : 'text-bz-border'}`}>
                    {numPrefix}
                  </span>
                )}
                <span className="line-clamp-2 leading-snug">{label || sub.title}</span>
              </button>
            )
          })}
        </nav>
      ) : (
        <p className="px-2 text-[11px] text-bz-muted">Sem subsecções</p>
      )}
    </aside>
  )
}
