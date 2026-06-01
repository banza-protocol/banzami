import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getReference, getSection, getAllSectionSlugs } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'
import { SectionHero } from '@/components/SectionHero'
import { PaymentFlowDiagram } from '@/components/PaymentFlowDiagram'
import { EcosystemMap } from '@/components/EcosystemMap'
import { SDKArchitectureVisual } from '@/components/SDKArchitectureVisual'

interface Props {
  params: Promise<{ section: string }>
}

// Only pre-generated slugs are valid — unknown slugs return 404 without rendering
export const dynamicParams = false

// Statically generate all section routes from BANZA_REFERENCE.md.
// 'banzai' slug is excluded — handled by app/banzai/page.tsx (live BanzAI interface).
const STATIC_ROUTE_OVERRIDES = new Set(['banzai'])

export async function generateStaticParams() {
  return getAllSectionSlugs()
    .filter((slug) => !STATIC_ROUTE_OVERRIDES.has(slug))
    .map((slug) => ({ section: slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section: slug } = await params
  const section = getSection(slug)
  if (!section) return {}
  return {
    title: section.title,
    description: `BANZA Protocol Reference — §${section.number}: ${section.title}`,
    openGraph: {
      title: `${section.title} · BANZA`,
      description: `BANZA Protocol Reference — §${section.number}: ${section.title}`,
      locale: 'en_US',
    },
  }
}

// Visual components mapped to new 12-section BANZA_REFERENCE.md structure
function SectionVisual({ number }: { number: number }) {
  switch (number) {
    case 3:  return <EcosystemMap />            // Core Principles
    case 5:  return <PaymentFlowDiagram />      // Federation
    case 8:  return <EcosystemMap />            // Operators
    case 9:  return <SDKArchitectureVisual />   // Developer Resources
    default: return null
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
    <div className="px-5 py-10 md:px-8 lg:px-12">
      <div className="mx-auto max-w-3xl">

        {/* Section hero */}
        <SectionHero section={section} total={reference.sections.length} />

        {/* Domain-specific visual component (if applicable) */}
        <SectionVisual number={section.number} />

        {/* Main content from BANZA_REFERENCE.md */}
        <MarkdownSection content={section.content} />

        {/* Prev / Next navigation */}
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

        {/* Source + actions */}
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-bz-muted">
            Derived from{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono">BANZA_REFERENCE.md</code>
            {' '}· v{reference.meta.version}
          </p>
          <div className="flex gap-3">
            <Link href="/introduction" className="text-xs font-semibold text-bz-primary hover:underline">
              Full reference
            </Link>
            <span className="text-bz-border">·</span>
            <Link href="/" className="text-xs font-semibold text-bz-muted hover:text-bz-text">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
