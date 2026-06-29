import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PlatformBanner } from '@/components/PlatformBanner';

export const viewport: Viewport = {
  themeColor: '#FBD2D0',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://banzami.com'),
  title: {
    default: 'Banzami — A carteira Kwanza de Angola',
    template: '%s · Banzami',
  },
  description:
    'O Banzami é a rede de pagamentos wallet-native de Angola. Carteira em Kwanza, paga por QR ou para um @banza, recebe em segundos. Construído sobre o protocolo aberto BANZA.',
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
    title: 'Banzami — A carteira Kwanza de Angola',
    description:
      'A rede de pagamentos wallet-native de Angola. Paga por QR ou para um @banza e recebe em segundos. Construído sobre o protocolo aberto BANZA.',
    url: 'https://banzami.com',
    images: [{ url: '/brand/banzami_icon.png', width: 1254, height: 1254, alt: 'Banzami' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Banzami — A carteira Kwanza de Angola',
    description: 'A rede de pagamentos wallet-native de Angola. Construído sobre o protocolo aberto BANZA.',
    images: ['/brand/banzami_icon.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Dossier font import (README §Tipografia): Nunito + JetBrains Mono.
            Loaded via <link> to avoid a build-time network dependency. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><PlatformBanner />{children}</body>
    </html>
  );
}
