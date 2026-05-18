'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  sections: ReferenceSection[]
}

export function SectionNav({ sections }: Props) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5">
      <Link
        href="/"
        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          pathname === '/'
            ? 'bg-banzami-100 text-banzami-800'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        Overview
      </Link>
      <Link
        href="/reference"
        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          pathname === '/reference'
            ? 'bg-banzami-100 text-banzami-800'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        Full Reference
      </Link>

      <div className="my-2 border-t border-slate-100" />

      {sections.map((section) => {
        const href = `/${section.slug}`
        const active = pathname === href
        return (
          <Link
            key={section.id}
            href={href}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-banzami-100 font-medium text-banzami-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="mr-2 font-mono text-xs text-slate-400">{section.number}.</span>
            {section.title}
          </Link>
        )
      })}
    </nav>
  )
}
