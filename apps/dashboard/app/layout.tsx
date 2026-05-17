import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title:       'Banzami Business',
  description: 'Business dashboard — Banzami',
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
