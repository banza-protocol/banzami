'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  sections: ReferenceSection[]
}

export function SectionNav({ sections }: Props) {
  const pathname = usePathname()

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
        <div className="text-xs font-bold tracking-widest text-bz-primary uppercase">Banzami</div>
        <div className="text-[10px] text-bz-muted">Documentação oficial</div>
      </div>

      {navLink('/', 'Início')}
      {navLink('/reference', 'Referência completa')}

      <div className="my-3 border-t border-bz-border" />

      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-bz-muted">
        Secções
      </div>

      {sections.map((section) => {
        const href = `/${section.slug}`
        const active = isActive(href)
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
              className={`w-5 shrink-0 font-mono text-[10px] ${active ? 'text-bz-primary' : 'text-bz-border'}`}
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
