import type { Metadata, Viewport } from 'next';
import './globals.css';

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
  keywords: [
    'Banzami',
    'Kwanza',
    'pagamentos Angola',
    'carteira digital',
    'QR',
    'BANZA',
    'wallet-native',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_AO',
    siteName: 'Banzami',
    title: 'Banzami — A carteira Kwanza de Angola',
    description:
      'A rede de pagamentos wallet-native de Angola. Paga por QR ou para um @banza e recebe em segundos. Construído sobre o protocolo aberto BANZA.',
    url: 'https://banzami.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Banzami — A carteira Kwanza de Angola',
    description:
      'A rede de pagamentos wallet-native de Angola. Construído sobre o protocolo aberto BANZA.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Fonts loaded via <link> (not next/font) to avoid a build-time network
            dependency; system-ui is the graceful fallback if offline. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
