import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SupressaoDeContaPage } from '@/components/marketing/pages/SupressaoDeConta';

export const metadata: Metadata = {
  title: { absolute: 'Account deletion · Banzami' },
  description: 'How to delete your Banzami account: what is removed, what is retained for legal reasons, and how to make the request.',
  alternates: {
    canonical: 'https://banzami.com/en/supressao-de-conta',
    languages: { pt: 'https://banzami.com/supressao-de-conta' },
  },
};

export default function Page() {
  return (
    <SiteShell lang="en" current="supressao">
      <SupressaoDeContaPage lang="en" />
    </SiteShell>
  );
}
