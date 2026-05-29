import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Banzami Checkout',
  description: 'Pagamento seguro via Banzami',
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
  return (
    <html lang="pt">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-off-white">{children}</body>
    </html>
  );
}
