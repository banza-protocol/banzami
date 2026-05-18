import type { Metadata } from 'next'
import { getReference } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'

export const metadata: Metadata = {
  title: 'Official Reference Document',
  description:
    'The complete Banzami reference document — all 20 sections, single source of truth for the ecosystem.',
}

export default function ReferencePage() {
  const reference = getReference()

  return (
    <div className="mx-auto max-w-3xl">
      {/* Document header */}
      <div className="mb-12 border-b border-slate-200 pb-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
          Banzami — Official Reference Document
        </h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="font-medium text-slate-400">Version</dt>
            <dd className="font-mono text-slate-700">{reference.meta.version}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-400">Status</dt>
            <dd className="text-slate-700">{reference.meta.status}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-400">Author</dt>
            <dd className="text-slate-700">{reference.meta.author}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-400">Date</dt>
            <dd className="font-mono text-slate-700">{reference.meta.date}</dd>
          </div>
        </dl>

        <div className="mt-6 rounded-xl border border-banzami-100 bg-banzami-50 px-6 py-3 text-sm font-medium text-banzami-800">
          {reference.tagline}
        </div>
      </div>

      {/* Table of contents */}
      <nav className="mb-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Contents
        </h2>
        <ol className="grid gap-1 sm:grid-cols-2">
          {reference.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#section-${section.number}`}
                className="flex items-baseline gap-2 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-banzami-50 hover:text-banzami-700 transition-colors"
              >
                <span className="font-mono text-xs text-slate-400">{section.number}.</span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* All sections rendered inline */}
      {reference.sections.map((section) => (
        <div key={section.id} id={`section-${section.number}`} className="mb-16 scroll-mt-20">
          <MarkdownSection content={section.content} />
          <div className="mt-8 border-t border-slate-100" />
        </div>
      ))}

      {/* Source attribution */}
      <div className="mt-16 rounded-2xl border border-banzami-100 bg-banzami-50 px-8 py-6 text-center">
        <p className="text-sm font-medium text-banzami-800">
          This page is rendered entirely from{' '}
          <code className="rounded bg-banzami-100 px-1.5 py-0.5 font-mono text-xs">
            docs/BANZAMI_REFERENCE.md
          </code>
        </p>
        <p className="mt-1 text-xs text-banzami-600">
          Per ADR-015 — the markdown document is canonical. The website is the visual layer only.
        </p>
      </div>
    </div>
  )
}
