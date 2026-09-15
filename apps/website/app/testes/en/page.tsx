import type { Metadata } from 'next';
import { TestesContent } from '@/components/site/TestesContent';
import type { BetaApp } from '@/lib/beta';

export const metadata: Metadata = {
  title: 'Testers',
  description:
    'Help us test the Banzami apps — App Banzami and App Comerciante — on iPhone (TestFlight) and Android (Google Play). Register your interest.',
  alternates: {
    canonical: 'https://banzami.com/testes/en',
    languages: {
      pt: 'https://banzami.com/testes',
      en: 'https://banzami.com/testes/en',
    },
  },
};

function appsFrom(app?: string): BetaApp[] | undefined {
  if (app === 'banzami') return ['APP_BANZAMI'];
  if (app === 'comerciante') return ['APP_MERCHANT'];
  return undefined;
}

export default async function TestesEnPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  return <TestesContent lang="en" initialApps={appsFrom(app)} />;
}
