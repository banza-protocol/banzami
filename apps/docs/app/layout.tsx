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
  icons: {
    icon: [
      { url: '/banza_icon_32.png',  sizes: '32x32',  type: 'image/png' },
      { url: '/banza_icon_64.png',  sizes: '64x64',  type: 'image/png' },
    ],
    apple: { url: '/banza_icon_180.png', sizes: '180x180', type: 'image/png' },
  },
  robots: { index: true, follow: true },
  authors: [{ name: 'Organização Banzami' }],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const reference = getReference()

  return (
    <html lang="pt-AO" suppressHydrationWarning className="overflow-x-hidden">
      <body className={`${inter.variable} bg-bz-bg text-bz-text antialiased font-sans overflow-x-hidden`}>

        {/* Top navigation */}
        <header className="sticky top-0 z-40 border-b border-bz-border bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-5 md:px-8">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/banza/banzami-logo.png" alt="Banzami" className="h-8 w-auto object-contain" />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {[
                { href: '/reference',                          label: 'Referência' },
                { href: '/banza-para-programadores',           label: 'Programadores' },
                { href: '/banza-para-comerciantes',            label: 'Comerciantes' },
                { href: '/arquitectura-tecnica',               label: 'Arquitectura' },
                { href: '/seguranca-e-integridade-financeira', label: 'Segurança' },
                { href: '/validacao',                          label: 'Validação' },
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
          <main className="min-w-0 flex-1">{children}</main>
        </div>

        {/* Footer */}
        <footer className="border-t border-bz-border bg-white">
          <div className="mx-auto max-w-screen-2xl px-6 py-10">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/banza/banzami-logo.png" alt="Banzami" className="h-7 w-auto object-contain" />
                <p className="mt-2 text-xs text-bz-muted">
                  Banza — Rede Angolana de Pagamentos Instantâneos por QR Code
                </p>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-bz-muted">
                <Link href="/o-que-e-o-banzami" className="hover:text-bz-primary">O que é o Banzami</Link>
                <Link href="/banza-para-programadores" className="hover:text-bz-primary">Programadores</Link>
                <Link href="/banza-para-comerciantes" className="hover:text-bz-primary">Comerciantes</Link>
                <Link href="/arquitectura-tecnica" className="hover:text-bz-primary">Arquitectura</Link>
                <Link href="/reference" className="hover:text-bz-primary">Referência completa</Link>
                <Link href="/validacao" className="hover:text-bz-primary">Validação</Link>
              </div>
            </div>

          </div>
        </footer>
      </body>
    </html>
  )
}
