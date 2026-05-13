import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'Banzami Admin',
  description: 'Internal operations dashboard — Banzami',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
