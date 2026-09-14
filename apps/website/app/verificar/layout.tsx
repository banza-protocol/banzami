import type { Metadata } from 'next';

// The verifier page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: 'Verificar comprovativo',
  description: 'Confirme uma referência de comprovativo Banzami no registo oficial.',
  alternates: { canonical: 'https://banzami.com/verificar' },
};

export default function VerificarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
