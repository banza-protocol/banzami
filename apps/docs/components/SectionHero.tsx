import Link from 'next/link'
import type { ReferenceSection } from '@/lib/types'

function readingTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

interface Props {
  section: ReferenceSection
  total: number
}

export function SectionHero({ section, total }: Props) {
  const minutes = readingTime(section.content)

  return (
    <div className="mb-10 border-b border-bz-border pb-10">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-xs text-bz-muted">
        <Link href="/" className="hover:text-bz-primary transition-colors">
          Início
        </Link>
        <span>/</span>
        <span className="text-bz-text">{section.title}</span>
      </div>

      {/* Section badge */}
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-bz-border bg-bz-surface px-3 py-1">
        <span className="font-mono text-xs font-bold text-bz-primary">§{section.number}</span>
        <span className="text-xs text-bz-muted">de {total} secções</span>
      </div>

      {/* Title */}
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-bz-text sm:text-4xl">
        {section.title}
      </h1>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-bz-muted">
        <span className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          {minutes} min de leitura
        </span>
        {section.subsections.length > 0 && (
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
            {section.subsections.length} subsecções
          </span>
        )}
      </div>

      {/* Subsection quick navigation */}
      {section.subsections.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {section.subsections.map((sub) => (
            <a
              key={sub.id}
              href={`#${sub.anchor}`}
              className="rounded-full border border-bz-border bg-white px-3 py-1 text-xs font-medium text-bz-muted transition-colors hover:border-bz-primary hover:text-bz-primary"
            >
              {sub.title}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
