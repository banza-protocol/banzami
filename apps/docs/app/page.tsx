import type { Metadata } from 'next'
import { getReference } from '@/lib/reference'
import { SectionCard } from '@/components/SectionCard'

export const metadata: Metadata = {
  title: "Banzami — Angola's Instant Payment Network",
}

export default function HomePage() {
  const reference = getReference()

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero — content from BANZAMI_REFERENCE.md §1 tagline */}
      <div className="mb-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-banzami-200 bg-banzami-50 px-4 py-1.5 text-sm font-medium text-banzami-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-banzami-500" />
          Angola&apos;s QR-Native Instant Payment Network
        </div>

        <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          Money moves at{' '}
          <span className="text-banzami-600">internet speed.</span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600">
          {reference.tagline}
        </p>

        <div className="mt-4 font-mono text-sm text-slate-400">
          SCAN &nbsp;→&nbsp; CONFIRM &nbsp;→&nbsp; PAID INSTANTLY
        </div>
      </div>

      {/* Section grid — every section card derived from BANZAMI_REFERENCE.md */}
      <div className="mb-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Reference Sections</h2>
          <span className="text-sm text-slate-400">
            {reference.sections.length} sections &middot; Source:{' '}
            <code className="font-mono text-xs">docs/BANZAMI_REFERENCE.md</code>
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reference.sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      </div>

      {/* Source truth notice */}
      <div className="rounded-2xl border border-banzami-100 bg-banzami-50 px-8 py-6 text-center">
        <p className="text-sm font-medium text-banzami-800">
          All content on this site derives from{' '}
          <code className="rounded bg-banzami-100 px-1.5 py-0.5 font-mono text-xs">
            docs/BANZAMI_REFERENCE.md
          </code>
        </p>
        <p className="mt-1 text-xs text-banzami-600">
          Per ADR-015 — the markdown document is the single source of truth. This site is the visual rendering layer.
        </p>
      </div>
    </div>
  )
}
