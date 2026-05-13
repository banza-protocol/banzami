import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Banzami Pay',
  description: 'Pague com a app Banzami',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-off-white min-h-screen">{children}</body>
    </html>
  );
}
