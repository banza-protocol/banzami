import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Inter, bundled for exact parity with the native app (WEB-APP-001 §9) and to
// avoid any external font request under the app CSP.
const inter = localFont({
  variable: '--font-inter',
  display: 'swap',
  src: [
    { path: './fonts/Inter-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Inter-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/Inter-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/Inter-Bold.ttf', weight: '700', style: 'normal' },
    { path: './fonts/Inter-ExtraBold.ttf', weight: '800', style: 'normal' },
  ],
});

export const metadata: Metadata = {
  title: 'App Banzami',
  description: 'A sua carteira Banzami no browser. Sandbox — dinheiro fictício.',
  // The authenticated financial app is never indexed (WEB-APP-001 §151).
  robots: { index: false, follow: false, nocache: true },
  applicationName: 'App Banzami',
  appleWebApp: { capable: true, title: 'App Banzami', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#B5101F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
