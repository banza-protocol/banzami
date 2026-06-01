import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import { getReference } from '@/lib/reference'
import { SectionNav } from '@/components/SectionNav'
import { BackToTop } from '@/components/BackToTop'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'BANZA — Open Financial Infrastructure Protocol',
    template: '%s · BANZA',
  },
  description:
    'BANZA is the open protocol for certified payment operators, federation, trust and financial infrastructure in Angola. ' +
    'Public rules, open certification, verifiable invariants, and federation across certified operators.',
  keywords: [
    'BANZA',
    'open payment protocol',
    'Angola',
    'financial infrastructure',
    'BanzAI',
    'protocol operating system',
    'certified operators',
    'federation',
    'instant payments',
    'open protocol',
    'certification framework',
  ],
  openGraph: {
    title: 'BANZA — Open Financial Infrastructure Protocol for Angola',
    description:
      'BANZA is the open protocol for certified payment operators, federation, trust and financial infrastructure in Angola.',
    siteName: 'BANZA',
    locale: 'en_US',
    type: 'website',
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico?v=3',       sizes: 'any' },
      { url: '/favicon-32x32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png?v=3', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' }],
  },
  robots: { index: true, follow: true },
  authors: [{ name: 'BANZA Protocol' }],
}

const NAV_LINKS = [
  { href: '/core-principles',     label: 'Protocol',      ai: false },
  { href: '/certification',       label: 'Certification', ai: false },
  { href: '/federation',          label: 'Federation',    ai: false },
  { href: '/trust',               label: 'Trust',         ai: false },
  { href: '/operators',           label: 'Operators',     ai: false },
  { href: '/developer-resources', label: 'Developers',    ai: false },
  { href: '/governance',          label: 'Governance',    ai: false },
  { href: '/banzai',              label: 'BanzAI',        ai: true  },
]

const FOOTER_LINKS = [
  { href: '/introduction',         label: 'Introduction' },
  { href: '/core-principles',      label: 'Protocol' },
  { href: '/certification',        label: 'Certification' },
  { href: '/federation',           label: 'Federation' },
  { href: '/trust',                label: 'Trust' },
  { href: '/operators',            label: 'Operators' },
  { href: '/developer-resources',  label: 'Developers' },
  { href: '/governance',           label: 'Governance' },
  { href: '/roadmap',              label: 'Roadmap' },
  { href: '/faq',                  label: 'FAQ' },
  { href: '/reference',            label: 'Full Reference' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const reference = getReference()

  return (
    <html lang="en" suppressHydrationWarning className="overflow-x-hidden">
      <body className={`${inter.variable} bg-bz-bg text-bz-text antialiased font-sans overflow-x-hidden`}>

        {/* Top navigation */}
        <header className="fixed inset-x-0 top-0 z-40 border-b border-bz-border bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-5 md:px-8">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <span className="inline-block h-7 w-7 shrink-0 overflow-hidden rounded-[9px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/banza/banzami-logo.png" alt="BANZA" className="h-full w-full object-cover" />
              </span>
              <span className="text-base font-bold tracking-tight text-bz-text">BANZA</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map(({ href, label, ai }) => (
                <Link
                  key={href}
                  href={href}
                  className={ai
                    ? 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-bz-gold transition-colors hover:bg-bz-gold-light'
                    : 'rounded-lg px-3 py-1.5 text-sm text-bz-muted transition-colors hover:bg-bz-surface hover:text-bz-text'
                  }
                >
                  {ai && (
                    <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1l1.2 3.8H11l-3 2.2 1.1 3.6L6 8.3 2.9 10.6 4 7 1 4.8h3.8z" fill="currentColor"/>
                    </svg>
                  )}
                  {label}
                </Link>
              ))}
            </nav>

            {/* Version badge + CTA */}
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-bz-border bg-bz-surface px-2.5 py-1 font-mono text-[10px] font-medium text-bz-muted sm:inline">
                v{reference.meta.version}
              </span>
              <Link
                href="/reference"
                className="rounded-lg bg-bz-primary px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-bz-primary-dark"
              >
                Reference
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-screen-2xl pt-14">
          {/* Sidebar — hidden on mobile */}
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-bz-border bg-white px-3 py-5 lg:block xl:w-64">
            <SectionNav sections={reference.sections} />
          </aside>

          {/* Main content area */}
          <main className="min-w-0 flex-1">{children}</main>
        </div>

        {/* Footer */}
        <footer className="border-t border-bz-border bg-white">
          <div className="mx-auto max-w-screen-2xl px-6 py-10">
            <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">

              {/* Brand */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-6 w-6 shrink-0 overflow-hidden rounded-[8px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/banza/banzami-logo.png" alt="BANZA" className="h-full w-full object-cover" />
                  </span>
                  <span className="font-bold text-bz-text">BANZA</span>
                </div>
                <p className="mt-1 text-xs text-bz-muted">
                  Open Financial Infrastructure Protocol
                </p>
                <p className="mt-2 font-mono text-[10px] text-bz-muted">
                  v{reference.meta.version} · {reference.meta.date}
                </p>
              </div>

              {/* Links */}
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {FOOTER_LINKS.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`text-xs transition-colors ${
                      href === '/banzai'
                        ? 'text-bz-gold/70 hover:text-bz-gold'
                        : 'text-bz-muted hover:text-bz-primary'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-8 border-t border-bz-border pt-6 text-xs text-bz-muted">
              BANZA is an open protocol. The specification, conformance suite, and certification framework
              are publicly available to any operator. No bilateral agreement required.
            </div>
          </div>
        </footer>

        <BackToTop />
      </body>
    </html>
  )
}
