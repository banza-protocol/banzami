import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { PlatformBanner } from '@/components/PlatformBanner';

export const viewport: Viewport = {
  themeColor: '#FBD2D0',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://banzami.com'),
  title: {
    default: 'Banzami — Pagamentos em Kwanza, de carteira para carteira',
    template: '%s · Banzami',
  },
  description:
    'Banzami: pagamentos nativos de carteira em Kwanza, por QR ou para um @banza, construídos sobre o protocolo aberto BANZA. Sandbox pública disponível; Financial Live indisponível.',
  applicationName: 'Banzami',
  authors: [{ name: 'Banzami' }],
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  keywords: ['Banzami', 'Kwanza', 'pagamentos Angola', 'carteira digital', 'QR', 'BANZA', 'wallet-native'],
  openGraph: {
    type: 'website',
    locale: 'pt_AO',
    siteName: 'Banzami',
    title: 'Banzami — Pagamentos em Kwanza, de carteira para carteira',
    description:
      'Pagamentos nativos de carteira em Kwanza, por QR ou para um @banza, construídos sobre o protocolo aberto BANZA. Sandbox pública disponível; Financial Live indisponível.',
    url: 'https://banzami.com',
    images: [{ url: '/brand/banzami_icon.png', width: 1254, height: 1254, alt: 'Banzami' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Banzami — Pagamentos em Kwanza, de carteira para carteira',
    description: 'Pagamentos nativos de carteira em Kwanza, construídos sobre o protocolo aberto BANZA.',
    images: ['/brand/banzami_icon.png'],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The nonce middleware minted for this request. Next stamps it onto every
  // inline <script> it emits, which is what lets the policy use 'strict-dynamic'
  // instead of 'unsafe-inline'. headers() is a Promise in Next 15 — without the
  // await this reads .get off the Promise, the nonce is undefined, and our own
  // CSP then blocks the framework's bootstrap scripts.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="pt" nonce={nonce}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The homepage hero embeds app.banzami.com in an iframe; warm the
            connection early so the live phone paints sooner on load. */}
        <link rel="preconnect" href="https://app.banzami.com" />
        <link rel="dns-prefetch" href="https://app.banzami.com" />
        {/* Dossier font import (README §Tipografia): Nunito + JetBrains Mono.
            Loaded via <link> to avoid a build-time network dependency. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Cloudflare's Email Address Obfuscation rewrites every mailto link into
          /cdn-cgi/l/email-protection and relies on a decoder script our CSP
          (rightly) blocks, which left the menu, footer and contact links broken
          on first paint. <!--email_off--> … <!--/email_off--> is Cloudflare's
          documented opt-out; it is matched in the HTML text, so one pair around
          the whole body covers every page without weakening the CSP. React can
          only emit a comment as raw HTML, hence the two constant markers. */}
      <body>
        <span hidden dangerouslySetInnerHTML={{ __html: '<!--email_off-->' }} />
        <PlatformBanner />
        {children}
        <span hidden dangerouslySetInnerHTML={{ __html: '<!--/email_off-->' }} />
      </body>
    </html>
  );
}
