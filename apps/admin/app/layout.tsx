import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title:       'BANZADMIN — Painel de Operações',
  description: 'Portal interno de operações Banzami.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The per-request nonce middleware.ts minted. Reading a header also makes
  // every page render per request, which is what a nonce needs: a page baked at
  // build time would carry a nonce from build time and be blocked by the policy
  // of every later request.
  //
  // headers() is a Promise in Next 15: without the await this reads `.get` off
  // the Promise, the nonce is undefined, and the console's own scripts are the
  // ones our CSP blocks.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pt" nonce={nonce}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
