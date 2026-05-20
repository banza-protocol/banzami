import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Banza Pay',
  description: 'Pague com a app Banza',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-off-white min-h-screen">{children}</body>
    </html>
  );
}
