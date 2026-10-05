import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { SupressaoDeContaPage } from '@/components/marketing/pages/SupressaoDeConta';

export const metadata: Metadata = {
  title: { absolute: 'Supressão de conta · Banzami' },
  description: 'Como eliminar a sua conta Banzami: o que é removido, o que é conservado por obrigação legal, e como fazer o pedido.',
  alternates: {
    canonical: 'https://banzami.com/supressao-de-conta',
    languages: { en: 'https://banzami.com/en/supressao-de-conta' },
  },
};

export default function Page() {
  return (
    <SiteShell lang="pt" current="supressao">
      <SupressaoDeContaPage lang="pt" />
    </SiteShell>
  );
}
