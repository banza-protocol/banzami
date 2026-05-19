import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import { getReference } from '@/lib/reference'
import { SectionNav } from '@/components/SectionNav'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'Banza — Pagamentos Instantâneos em Kwanza | Banzami',
    template: '%s · Banzami',
  },
  description:
    'Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente. Banza é a rede de pagamentos instantâneos QR-native em Kwanza — wallet-to-wallet, liquidação instantânea, Banza SDK para programadores e Banza Business para comerciantes.',
  keywords: [
    'Banza',
    'Banzami',
    'pagamentos Angola',
    'QR Code Angola',
    'pagamentos em Kwanza',
    'carteira digital Angola',
    'Banza Business',
    'Banza SDK',
    'pagamentos instantâneos Angola',
    'ecommerce Angola',
    'pagamentos para táxi Angola',
  ],
  openGraph: {
    title: 'Banza — Pagamentos Instantâneos em Kwanza | Banzami',
    description:
      'Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente. Banza é a rede de pagamentos instantâneos QR-native em Kwanza — wallet-to-wallet, liquidação instantânea, Banza SDK e Banza Business.',
    siteName: 'Banzami',
    locale: 'pt_AO',
    type: 'website',
  },
  robots: { index: true, follow: true },
  authors: [{ name: 'Organização Banzami' }],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const reference = getReference()

  return (
    <html lang="pt-AO" suppressHydrationWarning>
      <body className={`${inter.variable} bg-bz-bg text-bz-text antialiased font-sans overflow-x-hidden`}>

        {/* Top navigation */}
        <header className="sticky top-0 z-40 border-b border-bz-border bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-5 md:px-8">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bz-primary">
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <rect x="2" y="2" width="7" height="7" rx="1.5" fill="white" />
                  <rect x="11" y="2" width="7" height="7" rx="1.5" fill="white" opacity="0.6" />
                  <rect x="2" y="11" width="7" height="7" rx="1.5" fill="white" opacity="0.6" />
                  <rect x="14" y="14" width="4" height="4" rx="1" fill="white" />
                </svg>
              </div>
              <span className="text-base font-bold tracking-tight text-bz-text">Banzami</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {[
                { href: '/reference',                 label: 'Referência' },
                { href: '/banza-para-programadores',          label: 'Programadores' },
                { href: '/banza-para-comerciantes',           label: 'Comerciantes' },
                { href: '/arquitectura-tecnica',                label: 'Arquitectura' },
                { href: '/seguranca-e-integridade-financeira',  label: 'Segurança' },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg px-3 py-1.5 text-sm text-bz-muted transition-colors hover:bg-bz-surface hover:text-bz-text"
                >
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
                Manifesto
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-screen-2xl">
          {/* Sidebar — hidden on mobile */}
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-bz-border bg-white px-3 py-5 lg:block xl:w-64">
            <SectionNav sections={reference.sections} />
          </aside>

          {/* Main content area */}
          <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
        </div>

        {/* Footer */}
        <footer className="border-t border-bz-border bg-white">
          <div className="mx-auto max-w-screen-2xl px-6 py-10">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-bz-primary">
                    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                      <rect x="2" y="2" width="7" height="7" rx="1.5" fill="white" />
                      <rect x="11" y="2" width="7" height="7" rx="1.5" fill="white" opacity="0.6" />
                      <rect x="2" y="11" width="7" height="7" rx="1.5" fill="white" opacity="0.6" />
                      <rect x="14" y="14" width="4" height="4" rx="1" fill="white" />
                    </svg>
                  </div>
                  <span className="font-bold text-bz-text">Banzami</span>
                </div>
                <p className="mt-1 text-xs text-bz-muted">
                  Banza — Rede Angolana de Pagamentos Instantâneos por QR Code
                </p>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-bz-muted">
                <Link href="/o-que-e-o-banzami" className="hover:text-bz-primary">O que é o Banzami</Link>
                <Link href="/banza-para-programadores" className="hover:text-bz-primary">Programadores</Link>
                <Link href="/banza-para-comerciantes" className="hover:text-bz-primary">Comerciantes</Link>
                <Link href="/arquitectura-tecnica" className="hover:text-bz-primary">Arquitectura</Link>
                <Link href="/reference" className="hover:text-bz-primary">Referência completa</Link>
              </div>
            </div>

          </div>
        </footer>
      </body>
    </html>
  )
}
