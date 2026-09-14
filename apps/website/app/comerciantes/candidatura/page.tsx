import type { Metadata } from 'next';
import { CandidaturaForm } from './CandidaturaForm';

export const metadata: Metadata = {
  title: 'Banzami Business — Registe o seu negócio',
  description:
    'Registe o seu negócio no Banzami: dados, documentos e verificação, num formulário online.',
  alternates: { canonical: 'https://banzami.com/comerciantes/candidatura' },
};

// Self-contained onboarding page (its own top bar + sidebar + panel), per the
// Banzami Business design dossier — no marketing SiteHeader/Footer here.
export default function CandidaturaPage() {
  return (
    <main className="min-h-screen bg-[#FFF7F6] px-6 pb-[60px] pt-7">
      <div className="mx-auto max-w-[1180px]">
        <CandidaturaForm />
      </div>
    </main>
  );
}
