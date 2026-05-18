import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getReference, getSection, getAllSectionSlugs } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'

interface Props {
  params: Promise<{ section: string }>
}

// All section routes are statically generated at build time from BANZAMI_REFERENCE.md
export async function generateStaticParams() {
  return getAllSectionSlugs().map((slug) => ({ section: slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section: slug } = await params
  const section = getSection(slug)
  if (!section) return {}
  return {
    title: section.title,
    description: `Banzami reference — §${section.number}: ${section.title}`,
  }
}

export default async function SectionPage({ params }: Props) {
  const { section: slug } = await params
  const section = getSection(slug)
  if (!section) notFound()

  const reference = getReference()
  const currentIndex = reference.sections.findIndex((s) => s.slug === slug)
  const prev = reference.sections[currentIndex - 1]
  const next = reference.sections[currentIndex + 1]

  return (
    <div className="mx-auto max-w-3xl">
      {/* Section header */}
      <div className="mb-8">
        <div className="mb-2 font-mono text-sm font-medium text-banzami-500">
          §{section.number} of {reference.sections.length}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {section.title}
        </h1>
        {section.subsections.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {section.subsections.map((sub) => (
              <a
                key={sub.id}
                href={`#${sub.anchor}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-banzami-100 hover:text-banzami-700 transition-colors"
              >
                {sub.title}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Section content — rendered from BANZAMI_REFERENCE.md */}
      <MarkdownSection content={section.content} />

      {/* Prev / Next navigation */}
      <div className="mt-16 flex items-center justify-between border-t border-slate-200 pt-8">
        {prev ? (
          <Link
            href={`/${prev.slug}`}
            className="group flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white px-6 py-4 text-left shadow-sm transition-all hover:border-banzami-300 hover:shadow-md"
          >
            <span className="text-xs font-medium text-slate-400 group-hover:text-banzami-500">
              ← §{prev.number}
            </span>
            <span className="text-sm font-semibold text-slate-700 group-hover:text-banzami-700">
              {prev.title}
            </span>
          </Link>
        ) : (
          <div />
        )}

        {next ? (
          <Link
            href={`/${next.slug}`}
            className="group flex flex-col items-end gap-1 rounded-xl border border-slate-200 bg-white px-6 py-4 text-right shadow-sm transition-all hover:border-banzami-300 hover:shadow-md"
          >
            <span className="text-xs font-medium text-slate-400 group-hover:text-banzami-500">
              §{next.number} →
            </span>
            <span className="text-sm font-semibold text-slate-700 group-hover:text-banzami-700">
              {next.title}
            </span>
          </Link>
        ) : (
          <div />
        )}
      </div>

      {/* Source attribution */}
      <div className="mt-8 text-center text-xs text-slate-400">
        Source:{' '}
        <code className="font-mono">docs/BANZAMI_REFERENCE.md</code> — v
        {reference.meta.version}
      </div>
    </div>
  )
}
