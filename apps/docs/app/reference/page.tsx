import type { Metadata } from 'next'
import Link from 'next/link'
import { getReference } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'
import { ReadingProgress } from '@/components/ReadingProgress'
import { ReferenceToc } from '@/components/ReferenceToc'
import { ReferenceMobileToc } from '@/components/ReferenceMobileToc'
import { BackToTop } from '@/components/BackToTop'

export const metadata: Metadata = {
  title: { absolute: 'Banza — Referência Oficial do Protocolo' },
  description:
    'Referência oficial do Protocolo Banza — 20 secções cobrindo filosofia institucional, arquitectura técnica, infraestrutura de pagamentos, segurança financeira e visão da rede Banza para Angola.',
}

export default function ReferencePage() {
  const reference = getReference()

  return (
    <>
      {/* Reading progress bar (client component) */}
      <ReadingProgress />
      <BackToTop />

      <div className="flex min-h-screen">
        {/* Sticky mini ToC — visible on xl+ with active section tracking */}
        <ReferenceToc sections={reference.sections} />

        {/* Main document */}
        <div className="min-w-0 flex-1 px-5 py-10 md:px-8 lg:px-12">
          <div className="mx-auto max-w-3xl">

            {/* Document header */}
            <div className="mb-12">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-bz-primary" />
                <span className="text-xs font-semibold text-bz-primary">Documento Oficial</span>
              </div>

              <h1 className="mb-4 text-3xl font-bold tracking-tight text-bz-text sm:text-4xl">
                Banza — Referência Oficial do Protocolo
              </h1>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {[
                  { label: 'Versão',  value: reference.meta.version,  mono: true },
                  { label: 'Estado',  value: reference.meta.status,   mono: false },
                  { label: 'Organização', value: reference.meta.author, mono: false },
                  { label: 'Data',    value: reference.meta.date,     mono: true },
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

            {/* Mobile ToC — active section tracking */}
            <ReferenceMobileToc sections={reference.sections} />

            {/* All sections rendered from BANZA_REFERENCE.md */}
            {reference.sections.map((section) => (
              <article
                key={section.id}
                id={`section-${section.number}`}
                className="mb-16 scroll-mt-20"
              >
                <MarkdownSection content={section.content} />

                {/* Section footer */}
                <div className="mt-8 flex items-center justify-between border-t border-bz-border pt-4">
                  <span className="font-mono text-[10px] text-bz-muted">
                    §{section.number} · {section.subsections.length} subsecções
                  </span>
                  <Link
                    href={`/${section.slug}`}
                    className="text-xs font-semibold text-bz-primary hover:underline"
                  >
                    Abrir em página própria →
                  </Link>
                </div>
              </article>
            ))}

            {/* Attribution */}
            <div className="mt-16 rounded-3xl border border-bz-border bg-bz-surface px-8 py-8 text-center">
              <div className="mb-2 text-sm font-semibold text-bz-text">
                Documento renderizado a partir de{' '}
                <code className="rounded bg-bz-border px-1.5 font-mono">docs/BANZA_REFERENCE.md</code>
              </div>
              <p className="text-xs text-bz-muted">
                ADR-015 — o ficheiro markdown é canónico. Este site é a camada de apresentação visual.
              </p>
              <p className="mt-2 text-xs text-bz-muted">
                Organização Banzami · v{reference.meta.version}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
