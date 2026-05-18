import Link from 'next/link'
import type { ReferenceSection } from '@/lib/types'

interface Props {
  section: ReferenceSection
}

function preview(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('|') &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('>') &&
      !trimmed.startsWith('`') &&
      !trimmed.startsWith('*') &&
      trimmed.length > 40
    ) {
      return trimmed.replace(/\*\*/g, '').slice(0, 160) + (trimmed.length > 160 ? '…' : '')
    }
  }
  return ''
}

export function SectionCard({ section }: Props) {
  return (
    <Link
      href={`/${section.slug}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-banzami-300 hover:shadow-md"
    >
      <div className="mb-1 font-mono text-xs font-medium text-banzami-500">
        §{section.number}
      </div>
      <h3 className="mb-2 text-base font-semibold text-slate-900 group-hover:text-banzami-700">
        {section.title}
      </h3>
      {section.subsections.length > 0 && (
        <p className="mb-3 text-xs text-slate-400">
          {section.subsections.length} subsection{section.subsections.length !== 1 ? 's' : ''}
        </p>
      )}
      <p className="text-sm leading-relaxed text-slate-500 line-clamp-3">
        {preview(section.content)}
      </p>
    </Link>
  )
}
