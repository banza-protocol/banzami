import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Banza Pay',
  description: 'Pague com a app Banza',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the nonce injected by middleware. Next.js uses this to stamp
  // <nonce="…"> on every inline <script> it generates, allowing the
  // browser to verify them against the Content-Security-Policy header.
  const nonce = headers().get('x-nonce') ?? undefined;

  return (
    <html lang="pt" nonce={nonce}>
      <body className="bg-off-white min-h-screen">{children}</body>
    </html>
  );
}
