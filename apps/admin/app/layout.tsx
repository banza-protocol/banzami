import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title:       'BANZADMIN — Painel de Operações',
  description: 'Portal interno de operações Banzami.',
  // The operator console is internal: no page here — the beta-tester queue and
  // its PII included — may be indexed. The data is auth-gated (a crawler only
  // ever sees the login screen), and this makes the intent explicit on every
  // route (APP-BETA-001: admin routes never indexable).
  robots: { index: false, follow: false, nocache: true },
  // Same brand mark, and the same declaration order, as banzami.com
  // (apps/website/app/layout.tsx): the operator console is Banzami, and an
  // operator with the console and the website open should be able to tell the
  // two tabs apart by title, not by one of them having no icon at all.
  //
  // The assets are byte-identical copies of apps/website/public/. No
  // site.webmanifest: the website's advertises an installable public app, and
  // this console is internal and noindex — it should not present itself as one.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
      <body>
        {/* Consistent SANDBOX corner ribbon (same as banzami.com and the other surfaces). */}
        <div role="status" style={{ position: 'fixed', top: 0, left: 0, zIndex: 100, width: '150px', height: '150px', overflow: 'hidden', pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Ambiente SANDBOX — dinheiro fictício. O Financial Live está indisponível.</span>
          <div aria-hidden="true" style={{ position: 'absolute', top: '12px', left: '-52px', transform: 'rotate(-45deg)', width: '150px', padding: '5px 0', textAlign: 'center', background: 'linear-gradient(90deg,#FBE6A6,#F2CD6E)', color: '#7A4A06', fontSize: '9.5px', fontWeight: 900, letterSpacing: '.16em', boxShadow: '0 8px 18px -8px rgba(122,74,6,.5)' }}>SANDBOX</div>
        </div>
        {children}
      </body>
    </html>
  );
}
