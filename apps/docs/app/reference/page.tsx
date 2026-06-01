import type { Metadata } from 'next'
import Link from 'next/link'
import { getReference } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'
import { ReadingProgress } from '@/components/ReadingProgress'
import { ReferenceToc } from '@/components/ReferenceToc'
import { ReferenceMobileToc } from '@/components/ReferenceMobileToc'
import { BackToTop } from '@/components/BackToTop'

export const metadata: Metadata = {
  title: { absolute: 'BANZA — Protocol Reference' },
  description:
    'BANZA Protocol Reference — 12 sections covering the open financial infrastructure protocol, ' +
    'certification framework, federation architecture, trust hierarchy, BanzAI Protocol OS, ' +
    'governance, and operator resources for Angola.',
}

export default function ReferencePage() {
  const reference = getReference()

  return (
    <>
      <ReadingProgress />
      <BackToTop />

      <div className="flex min-h-screen">
        {/* Sticky ToC */}
        <ReferenceToc sections={reference.sections} />

        {/* Main document */}
        <div className="min-w-0 flex-1 px-5 py-10 md:px-8 lg:px-12">
          <div className="mx-auto max-w-3xl">

            {/* Document header */}
            <div className="mb-12">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-bz-primary" />
                <span className="text-xs font-semibold text-bz-primary">Official Protocol Reference</span>
              </div>

              <h1 className="mb-4 text-3xl font-bold tracking-tight text-bz-text sm:text-4xl">
                BANZA — Protocol Reference
              </h1>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {[
                  { label: 'Version',   value: reference.meta.version,  mono: true },
                  { label: 'Status',    value: reference.meta.status,   mono: false },
                  { label: 'Authority', value: reference.meta.author,   mono: false },
                  { label: 'Date',      value: reference.meta.date,     mono: true },
                ].map(({ label, value, mono }) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-bz-muted">{label}</dt>
                    <dd className={`text-bz-text ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 rounded-2xl border border-bz-primary/20 bg-bz-primary-light px-6 py-4">
                <p className="font-semibold text-bz-primary">{reference.tagline}</p>
              </div>
            </div>

            {/* Mobile ToC */}
            <ReferenceMobileToc sections={reference.sections} />

            {/* All sections from BANZA_REFERENCE.md */}
            {reference.sections.map((section) => (
              <article
                key={section.id}
                id={`section-${section.number}`}
                className="mb-16 scroll-mt-20"
              >
                <MarkdownSection content={section.content} />

                <div className="mt-8 flex items-center justify-between border-t border-bz-border pt-4">
                  <span className="font-mono text-[10px] text-bz-muted">
                    §{section.number} · {section.subsections.length} subsections
                  </span>
                  <Link
                    href={`/${section.slug}`}
                    className="text-xs font-semibold text-bz-primary hover:underline"
                  >
                    Open as page →
                  </Link>
                </div>
              </article>
            ))}

            {/* Attribution */}
            <div className="mt-16 rounded-3xl border border-bz-border bg-bz-surface px-8 py-8 text-center">
              <div className="mb-2 text-sm font-semibold text-bz-text">
                Rendered from{' '}
                <code className="rounded bg-bz-border px-1.5 font-mono">BANZA_REFERENCE.md</code>
              </div>
              <p className="text-xs text-bz-muted">
                ADR-015 — the markdown file is canonical. This site is the visual presentation layer.
              </p>
              <p className="mt-2 text-xs text-bz-muted">
                BANZA Protocol · v{reference.meta.version}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
