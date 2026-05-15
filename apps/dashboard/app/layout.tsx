import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'Banzami Business',
  description: 'Business dashboard — Banzami',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
