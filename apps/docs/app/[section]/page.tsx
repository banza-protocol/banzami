import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getReference, getSection, getAllSectionSlugs } from '@/lib/reference'
import { MarkdownSection } from '@/components/MarkdownSection'
import { SectionHero } from '@/components/SectionHero'
import { PaymentFlowDiagram } from '@/components/PaymentFlowDiagram'
import { WalletToWalletVisual } from '@/components/WalletToWalletVisual'
import { EcosystemMap } from '@/components/EcosystemMap'
import { SDKArchitectureVisual } from '@/components/SDKArchitectureVisual'
import { SecurityPipelineVisual } from '@/components/SecurityPipelineVisual'
import { QRCommerceVisual } from '@/components/QRCommerceVisual'
import { MobilePaymentMockup } from '@/components/MobilePaymentMockup'
import { ArchitectureDiagram } from '@/components/ArchitectureDiagram'

interface Props {
  params: Promise<{ section: string }>
}

// Only pre-generated slugs are valid — unknown slugs return 404 without rendering
export const dynamicParams = false

// Statically generate all section routes from BANZAMI_REFERENCE.md.
// 'banzamia' is excluded — that path is handled by app/banzamia/page.tsx (live AI interface).
const STATIC_ROUTE_OVERRIDES = new Set(['banzamia'])

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
    description: `Banzami — §${section.number}: ${section.title}`,
    openGraph: {
      title: `${section.title} · Banzami`,
      description: `Referência oficial Banzami — secção ${section.number}: ${section.title}`,
      locale: 'pt_AO',
    },
  }
}

// Domain-aware visual components inserted based on section number
function SectionVisual({ number }: { number: number }) {
  switch (number) {
    case 3:  return (
      <ArchitectureDiagram
        src="/images/architecture/banzami-ecosystem.svg"
        title="Ecossistema Banzami"
        description="Visão geral da infraestrutura financeira programável"
        alt="Diagrama do ecossistema Banzami — protocolo, operadores, liquidação e rastreabilidade"
      />
    )
    case 6:  return <PaymentFlowDiagram />         // How Banzami Works
    case 9:  return <QRCommerceVisual />            // QR Payment Ecosystem
    case 10: return <WalletToWalletVisual />        // Wallet-Native Philosophy
    case 12: return <SDKArchitectureVisual />        // Banzami for Developers
    case 14: return <EcosystemMap />                // The Banzami Flywheel (ecosystem)
    case 16: return <SecurityPipelineVisual />      // Security & Financial Integrity
    case 17: return <SDKArchitectureVisual />       // Technical Architecture
    case 18: return <EcosystemMap />               // The Banzami Ecosystem
    case 13: return <MobilePaymentMockup />        // Banzami for Consumers
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

        {/* Main content from BANZAMI_REFERENCE.md */}
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
            Conteúdo derivado de{' '}
            <code className="rounded bg-bz-surface px-1.5 font-mono">docs/BANZAMI_REFERENCE.md</code>
            {' '}· v{reference.meta.version}
          </p>
          <div className="flex gap-3">
            <Link href="/reference" className="text-xs font-semibold text-bz-primary hover:underline">
              Referência completa
            </Link>
            <span className="text-bz-border">·</span>
            <Link href="/" className="text-xs font-semibold text-bz-muted hover:text-bz-text">
              Início
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
