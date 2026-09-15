import type { Metadata } from 'next';
import { TestesContent } from '@/components/site/TestesContent';
import type { BetaApp } from '@/lib/beta';

export const metadata: Metadata = {
  title: 'Testers',
  description:
    'Ajude-nos a testar as apps do Banzami — App Banzami e App Comerciante — no iPhone (TestFlight) e Android (Google Play). Registe o seu interesse.',
  alternates: {
    canonical: 'https://banzami.com/testes',
    languages: {
      pt: 'https://banzami.com/testes',
      en: 'https://banzami.com/testes/en',
    },
  },
};

// ?app=banzami / ?app=comerciante only preselects which app the form offers. It
// is a UI convenience, never authority — the person can still change it, and the
// backend decides nothing from it.
function appsFrom(app?: string): BetaApp[] | undefined {
  if (app === 'banzami') return ['APP_BANZAMI'];
  if (app === 'comerciante') return ['APP_MERCHANT'];
  return undefined;
}

export default async function TestesPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  return <TestesContent lang="pt" initialApps={appsFrom(app)} />;
}
