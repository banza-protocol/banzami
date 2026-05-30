import type { Metadata } from 'next'
import Link from 'next/link'
import { getReference, getSectionByNumber } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'
import { SectionHero } from '@/components/SectionHero'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Sobre o BanzAI',
  description: 'BanzAI — o Sistema Operativo do Protocolo Banza. Compreender, explicar, validar, simular, certificar e federar operadores. Ferramentas determinam a verdade. A IA explica a verdade.',
  openGraph: {
    title: 'Sobre o BanzAI · Banza',
    description: 'O Sistema Operativo do Protocolo Banza. 16 módulos — Protocol Graph, RAG, Certification Copilot, Federation Intelligence, Digital Twin, Protocol Simulator.',
    locale: 'pt_AO',
  },
}

export default function SobreBanzAIPage() {
  const reference = getReference()
  const section = getSectionByNumber(11)
  if (!section) notFound()

  const sections = reference.sections
  const idx = sections.findIndex((s) => s.number === 11)
  const prev = sections[idx - 1]
  const next = sections[idx + 1]

  return (
    <div className="px-5 py-10 md:px-8 lg:px-12">
      <div className="mx-auto max-w-3xl">

        <SectionHero section={section} total={sections.length} />

        {/* Protocol OS context */}
        <p className="mb-6 text-sm leading-relaxed text-bz-muted">
          O BanzAI é o Sistema Operativo do Protocolo Banza — 16 módulos especializados que tornam o protocolo
          compreensível, validável, simulável e certificável. Não é um chatbot. É a interface cognitiva do protocolo:
          onde as ferramentas determinam a verdade e a IA explica a verdade.
        </p>

        {/* CTA to live interface */}
        <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-bz-primary/20 bg-bz-primary/5 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-bz-primary">Experimentar o BanzAI</p>
            <p className="mt-0.5 text-xs text-bz-muted">Chat ao vivo com o BanzAI</p>
          </div>
          <Link
            href="/banzamia"
            className="shrink-0 rounded-xl bg-bz-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Abrir BanzAI →
          </Link>
        </div>

        <MarkdownSection content={section.content} />

        {/* Prev / Next */}
        <div className="mt-16 grid grid-cols-1 gap-3 border-t border-bz-border pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/${prev.slug}`}
              className="group flex flex-col gap-1 rounded-2xl border border-bz-border bg-white p-5 shadow-card transition-all hover:border-bz-primary/30 hover:shadow-card-md"
            >
              <span className="flex items-center gap-1 text-xs font-medium text-bz-muted group-hover:text-bz-primary transition-colors">
                <svg className="h-3 w-3 rotate-180" viewBox="0 0 12 12" fill="currentColor"><path d="M10 6L4 1v10z" /></svg>
                §{prev.number} — anterior
              </span>
              <span className="text-sm font-semibold text-bz-text group-hover:text-bz-primary transition-colors">
                {prev.title}
              </span>
            </Link>
          ) : <div />}

          {next ? (
            <Link
              href={`/${next.slug}`}
              className="group flex flex-col items-end gap-1 rounded-2xl border border-bz-border bg-white p-5 shadow-card text-right transition-all hover:border-bz-primary/30 hover:shadow-card-md"
            >
              <span className="flex items-center gap-1 text-xs font-medium text-bz-muted group-hover:text-bz-primary transition-colors">
                §{next.number} — seguinte
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M10 6L4 1v10z" /></svg>
              </span>
              <span className="text-sm font-semibold text-bz-text group-hover:text-bz-primary transition-colors">
                {next.title}
              </span>
            </Link>
          ) : <div />}
        </div>

        {/* Source */}
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-bz-muted">
            Conteúdo derivado de{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono">docs/BANZA_REFERENCE.md §11</code>
            {' '}· v{reference.meta.version}
          </p>
          <div className="flex gap-3">
            <Link href="/reference" className="text-xs font-semibold text-bz-primary hover:underline">
              Ver referência completa
            </Link>
            <span className="text-bz-muted">·</span>
            <Link href="/banzamia" className="text-xs font-semibold text-bz-primary hover:underline">
              Abrir BanzAI
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
