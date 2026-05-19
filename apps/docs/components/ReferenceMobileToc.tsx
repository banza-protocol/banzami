'use client'

import { useEffect, useState } from 'react'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  sections: ReferenceSection[]
}

export function ReferenceMobileToc({ sections }: Props) {
  const [activeSectionId, setActiveSectionId] = useState(`section-${sections[0]?.number ?? 1}`)
  const [activeSubAnchor, setActiveSubAnchor] = useState('')
  const [open, setOpen] = useState(false)

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

  // Track active H3 subsection — re-runs when active section changes
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

  // Close dropdown on scroll
  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [])

  const activeSection = sections.find(s => `section-${s.number}` === activeSectionId)
  const subsections = activeSection?.subsections ?? []

  const goToSub = (anchor: string) => {
    const el = document.getElementById(anchor)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${anchor}`)
    setActiveSubAnchor(anchor)
    setOpen(false)
  }

  const activeSub = subsections.find(s => s.anchor === activeSubAnchor)
  const activeLabel = activeSub
    ? activeSub.title.replace(/^\d+\.\d+\s*/, '')
    : activeSection?.title ?? 'Índice'

  return (
    <div className="sticky top-14 z-20 mb-8 xl:hidden">
      <div className="border-b border-bz-border bg-white">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex w-full items-center gap-3 px-5 py-3 text-left"
          aria-expanded={open}
        >
          {activeSection && (
            <span className="shrink-0 font-mono text-[10px] text-bz-primary">
              §{activeSection.number}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bz-text">
            {activeLabel}
          </span>
          <svg
            className={`shrink-0 text-bz-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            width="14" height="14" viewBox="0 0 14 14" fill="none"
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {open && subsections.length > 0 && (
          <div className="border-t border-bz-border px-4 pb-3 pt-2">
            <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-bz-muted">
              Nesta secção
            </div>
            <nav className="flex flex-col gap-0.5">
              {subsections.map((sub) => {
                const active = activeSubAnchor === sub.anchor
                const numPrefix = sub.title.match(/^(\d+\.\d+)\s*/)?.[1]
                const label = sub.title.replace(/^\d+\.\d+\s*/, '')
                return (
                  <button
                    key={sub.id}
                    onClick={() => goToSub(sub.anchor)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-all duration-150 ${
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
                    <span className="leading-snug">{label || sub.title}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        )}
      </div>
    </div>
  )
}
