import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { PlatformBadge } from '@/components/PlatformBadge';

export const metadata: Metadata = {
  title: 'Banzami Pay',
  description: 'Pague com a app Banzami',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the nonce injected by middleware. Next.js uses this to stamp
  // <nonce="…"> on every inline <script> it generates, allowing the
  // browser to verify them against the Content-Security-Policy header.
  //
  // headers() is a Promise in Next 15. Without the await this reads `.get` off
  // the Promise itself, the nonce becomes undefined, and every inline script
  // Next emits is then blocked by our own CSP — the page renders unstyled and
  // dead rather than failing loudly.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="pt" nonce={nonce}>
      <body className="bg-off-white min-h-screen"><PlatformBadge />{children}</body>
    </html>
  );
}
