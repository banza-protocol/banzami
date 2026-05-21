'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  sections: ReferenceSection[]
}

export function SectionNav({ sections }: Props) {
  const pathname = usePathname()
  const [scrollActiveNumber, setScrollActiveNumber] = useState<number | null>(null)

  // On /reference, track which section is visible and highlight it in the sidebar
  useEffect(() => {
    if (pathname !== '/reference') {
      setScrollActiveNumber(null)
      return
    }

    const update = () => {
      let current: number | null = sections[0]?.number ?? null
      for (const s of sections) {
        const el = document.getElementById(`section-${s.number}`)
        if (el && el.getBoundingClientRect().top <= 120) current = s.number
      }
      setScrollActiveNumber(current)
    }

    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [pathname, sections])

  const isActive = (href: string) => pathname === href

  const navLink = (href: string, label: string, mono?: string) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-150 ${
          active
            ? 'bg-bz-primary-light font-semibold text-bz-primary'
            : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
        }`}
      >
        {mono && (
          <span className={`font-mono text-[10px] ${active ? 'text-bz-primary' : 'text-bz-border'}`}>
            {mono}
          </span>
        )}
        {label}
      </Link>
    )
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {/* Logo mark */}
      <div className="mb-4 px-3">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/banza/banzami-logo.png" alt="Banzami" className="h-6 w-auto object-contain" />
          <div className="text-xs font-bold tracking-widest text-bz-primary uppercase">Banzami</div>
        </div>
        <div className="mt-0.5 text-[10px] text-bz-muted">Documentação oficial</div>
      </div>

      {navLink('/', 'Início')}
      {navLink('/reference', 'Referência completa')}
      {navLink('/validacao', 'Validação')}

      <div className="my-3 border-t border-bz-border" />

      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-bz-muted">
        Secções
      </div>

      {sections.map((section) => {
        const href = `/${section.slug}`
        // On /reference: highlight based on scroll position
        // On individual section pages: highlight based on pathname
        const active =
          pathname === '/reference'
            ? scrollActiveNumber === section.number
            : isActive(href)
        return (
          <Link
            key={section.id}
            href={href}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-all duration-150 ${
              active
                ? 'bg-bz-primary-light font-semibold text-bz-primary'
                : 'text-bz-muted hover:bg-bz-surface hover:text-bz-text'
            }`}
          >
            <span
              className={`w-5 shrink-0 font-mono text-[10px] transition-colors ${active ? 'text-bz-primary' : 'text-bz-border'}`}
            >
              {section.number}.
            </span>
            <span className="line-clamp-1">{section.title}</span>
          </Link>
        )
      })}
    </nav>
  )
}
