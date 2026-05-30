import Link from 'next/link'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  section: ReferenceSection
}

function preview(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (
      t &&
      !t.startsWith('#') &&
      !t.startsWith('|') &&
      !t.startsWith('-') &&
      !t.startsWith('>') &&
      !t.startsWith('`') &&
      !t.startsWith('*') &&
      t.length > 40
    ) {
      return t.replace(/\*\*/g, '').replace(/`/g, '').slice(0, 150) + '…'
    }
  }
  return ''
}

export function SectionCard({ section }: Props) {
  return (
    <Link
      href={section.slug === 'banzai' ? '/sobre-banzamia' : `/${section.slug}`}
      className="group block rounded-2xl border border-bz-border bg-white p-6 shadow-card transition-all duration-200 hover:border-bz-primary/30 hover:shadow-card-md hover:-translate-y-0.5"
    >
      {/* Section number */}
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-bz-surface px-2.5 py-1">
        <span className="font-mono text-[10px] font-bold text-bz-primary">§{section.number}</span>
        {section.subsections.length > 0 && (
          <span className="text-[10px] text-bz-muted">
            · {section.subsections.length} sub
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mb-2 text-sm font-bold leading-snug text-bz-text group-hover:text-bz-primary transition-colors">
        {section.title}
      </h3>

      {/* Preview */}
      <p className="text-xs leading-relaxed text-bz-muted line-clamp-3">
        {preview(section.content)}
      </p>

      {/* Read arrow */}
      <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-bz-primary opacity-0 transition-opacity group-hover:opacity-100">
        <span>Ler</span>
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M10 6L4 1v10z" />
        </svg>
      </div>
    </Link>
  )
}
