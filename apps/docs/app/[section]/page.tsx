import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getReference, getSection, getAllSectionSlugs } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'
import { SectionHero } from '@/components/SectionHero'
import { DiagramPanel } from '@/components/protocol/DiagramPanel'

interface Props {
  params: Promise<{ section: string }>
}

// Only pre-generated slugs are valid — unknown slugs return 404 without rendering
export const dynamicParams = false

// Slugs with dedicated static pages that take precedence over this dynamic route
const STATIC_ROUTE_OVERRIDES = new Set(['banzai', 'operators', 'roadmap'])

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

// Canonical SVG panel mapped to each protocol section
// Source: /diagrams/protocol/ — synced from banza repo via deploy.sh
function SectionDiagram({ slug }: { slug: string }) {
  switch (slug) {
    case 'introduction':
    case 'core-principles':
      return (
        <DiagramPanel
          src="/diagrams/protocol/protocol-overview-v1.svg"
          alt="BANZA Protocol Overview — four properties and ecosystem hierarchy"
          caption="SVG-P-001 · BANZA_REFERENCE.md §1, §3"
        />
      )
    case 'why-banza-exists':
      return (
        <DiagramPanel
          src="/diagrams/protocol/protocol-hierarchy-v1.svg"
          alt="BANZA Protocol Hierarchy — ADR-025 canonical dependency graph"
          caption="SVG-P-002 · ADR-025"
        />
      )
    case 'certification':
      return (
        <DiagramPanel
          src="/diagrams/protocol/certification-levels-v1.svg"
          alt="BANZA Certification Levels — L0 through L4 capability matrix"
          caption="SVG-P-006 · BANZA_REFERENCE.md §4, ADR-028"
        />
      )
    case 'federation':
      return (
        <>
          <DiagramPanel
            src="/diagrams/protocol/federation-overview-v1.svg"
            alt="BANZA Federation Overview — 5-moment federation flow"
            caption="SVG-P-008 · BANZA_REFERENCE.md §5, ADR-026"
          />
          <DiagramPanel
            src="/diagrams/protocol/inter-operator-payment-flow-v1.svg"
            alt="BANZA Inter-Operator Payment Flow — cross-operator payment between Operator A and Operator B"
            caption="SVG-P-010 · BANZA_REFERENCE.md §5"
          />
          <DiagramPanel
            src="/diagrams/protocol/federation-trust-flow-v1.svg"
            alt="BANZA Federation Trust Flow — 9-step trust protocol"
            caption="SVG-P-009 · ADR-026 §Phase 5"
          />
        </>
      )
    case 'trust':
      return (
        <>
          <DiagramPanel
            src="/diagrams/protocol/trust-hierarchy-v1.svg"
            alt="BANZA Trust Hierarchy — Root Key to Key Manifest to Issuing Keys"
            caption="SVG-P-013 · BANZA_REFERENCE.md §6"
          />
          <DiagramPanel
            src="/diagrams/protocol/root-key-hierarchy-v1.svg"
            alt="BANZA Root Key Hierarchy — four-layer authority"
            caption="SVG-P-014 · ADR-029 §Phase 2"
          />
        </>
      )
    case 'banzai':
      return (
        <DiagramPanel
          src="/diagrams/protocol/banzai-positioning-v1.svg"
          alt="BanzAI positioning — BANZA certifies, BanzAI evaluates, operators implement"
          caption="SVG-P-021 · BANZA_REFERENCE.md §7, ADR-029"
        />
      )
    default:
      return null
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

        {/* Canonical SVG diagram for this section */}
        <SectionDiagram slug={slug} />

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
                §{prev.number} — previous
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
                §{next.number} — next
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M10 6L4 1v10z" /></svg>
              </span>
              <span className="text-sm font-semibold text-bz-text group-hover:text-bz-primary transition-colors">
                {next.title}
              </span>
            </Link>
          ) : <div />}
        </div>

        {/* Source attribution */}
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-bz-muted">
            Derived from{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono">BANZA_REFERENCE.md</code>
            {' '}· v{reference.meta.version}
          </p>
          <div className="flex gap-3">
            <Link href="/reference" className="text-xs font-semibold text-bz-primary hover:underline">
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
