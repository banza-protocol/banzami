import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { ProdutoPage } from '@/components/marketing/pages/Produto';

export const metadata: Metadata = {
  title: 'App Banzami — Pagar e receber em Kwanza',
  description:
    'A app Banzami para pagar por QR, enviar para um @banza e receber em segundos, com comprovativo verificável. Beta público em Sandbox.',
  alternates: {
    canonical: 'https://banzami.com/produto',
    languages: { en: 'https://banzami.com/en/produto' },
  },
};

// /produto — ported verbatim from handoff_site_completo/pages/Produto.dc.html.
export default function Page() {
  return (
    <SiteShell lang="pt" current="produto">
      <ProdutoPage lang="pt" />
    </SiteShell>
  );
}
