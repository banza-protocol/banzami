import type { Metadata } from 'next'
import Link from 'next/link'
import { BackToTop } from '@/components/BackToTop'
import { DiagramPanel } from '@/components/protocol/DiagramPanel'
import { ProtocolPropertyGrid } from '@/components/protocol/ProtocolPropertyGrid'
import { HowItWorks } from '@/components/protocol/HowItWorks'
import { CertificationLadder } from '@/components/protocol/CertificationLadder'
import { TrustArchitecturePreview } from '@/components/protocol/TrustArchitecturePreview'
import { BanzAIBoundaryPanel } from '@/components/protocol/BanzAIBoundaryPanel'
import { RoadmapMilestones } from '@/components/protocol/RoadmapMilestones'
import { CTASection } from '@/components/protocol/CTASection'

export const metadata: Metadata = {
  title: 'BANZA — Open Financial Infrastructure Protocol for Angola',
  description:
    'BANZA is the open protocol for certified payment operators, federation, trust and financial infrastructure in Angola. ' +
    'Public rules, open certification, verifiable invariants, and federation across certified operators.',
}

const PROBLEMS = [
  {
    title: 'Closed payment islands',
    desc: 'Each operator runs on its own rules. Networks cannot communicate. Cross-operator payment requires a bilateral agreement negotiated case by case.',
  },
  {
    title: 'WhatsApp receipts',
    desc: 'Screenshots of bank transfers as proof of payment — because no protocol-guaranteed alternative exists.',
  },
  {
    title: 'Discretionary access',
    desc: 'To integrate payments, a company must establish a bilateral agreement with a bank. The process takes months and terms are negotiated privately.',
  },
  {
    title: 'Missing protocol layer',
    desc: 'Angola has settlement rails — EMIS moves money between banks. EMIS does not resolve who can access the payment system under what verifiable rules.',
  },
]

const OPERATOR_CTAS = [
  {
    label: 'Read the reference',
    href: '/reference',
    description: 'Protocol specification, invariants, federation model, certification criteria.',
  },
  {
    label: 'Run conformance',
    href: '/certification',
    description: 'L0–L4 certification framework. Any operator that passes the suite becomes certified.',
  },
  {
    label: 'Prepare your manifest',
    href: '/trust',
    description: 'PKI-based trust architecture. Key manifest, certificates, BRL — ed25519.',
  },
  {
    label: 'Explore BanzAI',
    href: '/banzai',
    description: 'The Protocol Operating System — validates, simulates, evaluates readiness.',
  },
]

export default function HomePage() {
  return (
    <div className="overflow-x-hidden">
      <BackToTop />

      {/* ── 1. HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-bz-border px-5 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20 lg:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(153,0,17,0.06) 0%, transparent 70%)',
          }}
        />
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-4 py-2">
            <span className="h-2 w-2 animate-pulse-slow rounded-full bg-bz-primary" />
            <span className="text-xs font-semibold tracking-wide text-bz-primary">
              Open Financial Infrastructure Protocol · Angola
            </span>
          </div>

          <h1 className="mb-5 text-balance text-4xl font-bold tracking-tight text-bz-text sm:text-5xl lg:text-6xl">
            BANZA — Open Financial{' '}
            <span
              style={{
                backgroundImage: 'linear-gradient(135deg, #990011 0%, #CC001A 50%, #C89B3C 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Infrastructure Protocol
            </span>
          </h1>

          <p className="mx-auto mb-4 max-w-2xl text-lg leading-relaxed text-bz-muted md:text-xl">
            Not a bank. Not a wallet. Not an app.{' '}
            <strong className="font-semibold text-bz-text">A protocol.</strong>
          </p>

          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-bz-muted">
            BANZA defines the open rules that any operator can implement to process payments in Angola
            — and that any two certified operators can use to exchange payments with each other,
            without a bilateral agreement.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/reference" className="btn-primary px-6 py-3 text-base">
              Read the reference
            </Link>
            <Link href="/core-principles" className="btn-ghost px-6 py-3 text-base">
              Protocol specification
            </Link>
            <Link href="/banzai" className="btn-ghost px-6 py-3 text-base">
              <svg className="mr-1.5 h-3.5 w-3.5 text-bz-gold" viewBox="0 0 12 12" fill="none">
                <path d="M6 1l1.2 3.8H11l-3 2.2 1.1 3.6L6 8.3 2.9 10.6 4 7 1 4.8h3.8z" fill="currentColor"/>
              </svg>
              BanzAI
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. WHY BANZA EXISTS ──────────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Why BANZA exists
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Angola has the pieces. The protocol layer is missing.
        </h2>
        <p className="mb-10 max-w-2xl text-bz-muted">
          Angola has banks, ATM networks, homebanking apps, and sixteen million smartphones.
          What Angola does not have is the layer that connects them under open, verifiable rules.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="card p-5">
              <h3 className="mb-1.5 text-sm font-semibold text-bz-text">{p.title}</h3>
              <p className="text-xs leading-relaxed text-bz-muted">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link href="/why-banza-exists" className="text-sm font-semibold text-bz-primary hover:underline">
            The full analysis — two models (M-Pesa vs. Pix), the disappearing operator test →
          </Link>
        </div>
      </section>

      {/* ── 3. PROTOCOL OVERVIEW SVG ─────────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Protocol overview
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Four protocol properties. One open standard.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          BANZA is defined by four properties that no operator can override:
          public rules, open certification, verifiable invariants, and federation.
        </p>
        <DiagramPanel
          src="/diagrams/protocol/protocol-overview-v1.svg"
          alt="BANZA Protocol Overview — four properties and ecosystem hierarchy"
          caption="SVG-P-001 · Authority: BANZA_REFERENCE.md §1, §3"
        />
        <div className="mt-8">
          <ProtocolPropertyGrid />
        </div>
      </section>

      {/* ── 4. HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          How it works
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          BANZA defines. BanzAI evaluates. Operators implement. Certified operators federate.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          The protocol and the operator are distinct entities. BANZA does not operate the network.
          Any certified operator operates the network — under the same open rules.
        </p>
        <HowItWorks />
      </section>

      {/* ── 5. FEDERATION ────────────────────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Federation
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          Certified operators can route payments between each other.
        </h2>
        <p className="mb-3 max-w-2xl text-bz-muted">
          Without bilateral agreements. Without shared infrastructure.
          Because both implement the same open protocol.
        </p>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            ✓ COMPLETE — M1
          </span>
          <span className="text-xs text-bz-muted">79/79 federation tests · 14/14 interoperability scenarios</span>
        </div>
        <DiagramPanel
          src="/diagrams/protocol/federation-overview-v1.svg"
          alt="BANZA Federation Overview — 5-moment federation flow between two certified operators"
          caption="SVG-P-008 · Authority: BANZA_REFERENCE.md §5, ADR-026"
        />
        <div className="mt-4 flex gap-3">
          <Link href="/federation" className="text-sm font-semibold text-bz-primary hover:underline">
            Federation protocol →
          </Link>
          <span className="text-bz-border">·</span>
          <Link href="/trust" className="text-sm font-semibold text-bz-muted hover:text-bz-text">
            Trust architecture
          </Link>
        </div>
      </section>

      {/* ── 6. TRUST ARCHITECTURE ────────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Trust
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          PKI-based trust. Root ceremony. Verifiable certificates.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          A four-layer authority hierarchy — root key to operator certificate —
          with air-gapped ceremony, ed25519 signatures, and a public revocation list.
        </p>
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <TrustArchitecturePreview />
          <DiagramPanel
            src="/diagrams/protocol/trust-hierarchy-v1.svg"
            alt="BANZA Trust Hierarchy — Root Key to Operator Certificate chain"
            caption="SVG-P-013 · Authority: ADR-029"
          />
        </div>
        <div className="mt-6">
          <Link href="/trust" className="text-sm font-semibold text-bz-primary hover:underline">
            Full trust architecture →
          </Link>
        </div>
      </section>

      {/* ── 7. CERTIFICATION ─────────────────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Certification
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          L0 to L4. L3 is the federation gate.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          Any operator that passes the conformance suite becomes certified.
          No institutional approval. No bilateral agreement. The conformance suite is the gate.
        </p>
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <CertificationLadder />
          <DiagramPanel
            src="/diagrams/protocol/certification-levels-v1.svg"
            alt="BANZA Certification Levels — L0 through L4 capability matrix"
            caption="SVG-P-006 · Authority: BANZA_REFERENCE.md §4, ADR-028"
          />
        </div>
        <div className="mt-6">
          <Link href="/certification" className="text-sm font-semibold text-bz-primary hover:underline">
            Certification framework →
          </Link>
        </div>
      </section>

      {/* ── 8. BANZAI ────────────────────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-gold">
          BanzAI
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          BANZA certifies. BanzAI evaluates.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          BanzAI is the Protocol Operating System — not the certification authority.
          It validates, simulates, and explains. BANZA runs the authoritative conformance suite.
        </p>
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <BanzAIBoundaryPanel />
          <DiagramPanel
            src="/diagrams/protocol/banzai-positioning-v1.svg"
            alt="BanzAI positioning — BANZA certifies, BanzAI evaluates, operators implement"
            caption="SVG-P-021 · Authority: BANZA_REFERENCE.md §7, ADR-029"
          />
        </div>
        <div className="mt-6">
          <Link
            href="/banzai"
            className="inline-flex items-center gap-2 rounded-lg bg-bz-gold px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none">
              <path d="M6 1l1.2 3.8H11l-3 2.2 1.1 3.6L6 8.3 2.9 10.6 4 7 1 4.8h3.8z" fill="currentColor"/>
            </svg>
            Open BanzAI
          </Link>
        </div>
      </section>

      {/* ── 9. ROADMAP ───────────────────────────────────────────────────────── */}
      <section className="border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Roadmap
        </div>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
          M1 complete. M2 active.
        </h2>
        <p className="mb-8 max-w-2xl text-bz-muted">
          The protocol kernel, certification framework, federation protocol, and trust architecture
          are complete. Production deployment begins now.
        </p>
        <RoadmapMilestones />
        <div className="mt-6">
          <Link href="/roadmap" className="text-sm font-semibold text-bz-primary hover:underline">
            Full roadmap →
          </Link>
        </div>
      </section>

      {/* ── 10. OPERATOR / DEVELOPER CTAs ────────────────────────────────────── */}
      <CTASection
        eyebrow="Get started"
        title="For operators and developers"
        items={OPERATOR_CTAS}
      />

      {/* ── Source attribution ────────────────────────────────────────────────── */}
      <div className="border-t border-bz-border bg-bz-surface px-5 py-6 text-center text-xs text-bz-muted md:px-8 lg:px-12">
        BANZA Protocol · Reference v1.0 · Content derived from{' '}
        <code className="rounded bg-bz-border px-1.5 py-0.5 font-mono">BANZA_REFERENCE.md</code>
        {' '}· ADR-025
      </div>
    </div>
  )
}
