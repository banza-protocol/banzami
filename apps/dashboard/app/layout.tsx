import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title:       'Banza Business',
  description: 'Business dashboard — Banzami',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico',           sizes: 'any' },
      { url: '/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png?v=2', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
    ],
  },
};

// Reading headers forces dynamic rendering — required for per-request CSP nonces
// to be applied by Next.js to its internally generated inline scripts.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
