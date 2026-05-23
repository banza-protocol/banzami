import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Banza Pay',
  description: 'Pague com a app Banza',
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
