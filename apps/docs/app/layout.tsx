import type { Metadata } from 'next'
import Link from 'next/link'
import { getReference } from '@/lib/reference'
import { SectionNav } from '@/components/SectionNav'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Banzami — Angola\'s Instant Payment Network',
    template: '%s · Banzami',
  },
  description:
    "Angola's QR-native instant payment network. Wallet-to-wallet. Instant settlement. Built for every Angolan.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const reference = getReference()

  return (
    <html lang="pt" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 antialiased">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900">Banzami</span>
              <span className="hidden text-sm text-slate-400 sm:inline">
                — Angola&apos;s Instant Payment Network
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/reference" className="hover:text-slate-900">
                Reference
              </Link>
              <Link
                href="/banzami-for-developers"
                className="hover:text-slate-900"
              >
                Developers
              </Link>
              <Link
                href="/banzami-for-merchants"
                className="hover:text-slate-900"
              >
                Merchants
              </Link>
              <span className="ml-2 rounded-full border border-banzami-200 bg-banzami-50 px-3 py-1 text-xs font-medium text-banzami-700">
                v{reference.meta.version}
              </span>
            </nav>
          </div>
        </header>

        <div className="mx-auto flex max-w-screen-2xl">
          {/* Sidebar */}
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-4 py-6 lg:block">
            <SectionNav sections={reference.sections} />
          </aside>

          {/* Main content */}
          <main className="min-w-0 flex-1 px-6 py-10 lg:px-12">{children}</main>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-8">
          <div className="mx-auto max-w-screen-2xl px-6 text-center text-sm text-slate-400">
            <p>
              Banzami — Angola&apos;s QR-native instant payment network.{' '}
              <span className="font-medium text-slate-500">
                {reference.meta.author}
              </span>
            </p>
            <p className="mt-1 font-mono text-xs">
              Reference v{reference.meta.version} · Per ADR-015: all content derives from{' '}
              <code>docs/BANZAMI_REFERENCE.md</code>
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
