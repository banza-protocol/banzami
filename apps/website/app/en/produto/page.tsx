import type { Metadata } from 'next';
import { SiteShell } from '@/components/marketing/SiteShell';
import { ProdutoPage } from '@/components/marketing/pages/Produto';

export const metadata: Metadata = {
  title: { absolute: 'Banzami app — Pay and get paid in Kwanza' },
  description:
    'The Banzami app to pay by QR, send to a @banza and get paid in seconds, with a verifiable receipt. Public Beta in the Sandbox.',
  alternates: {
    canonical: 'https://banzami.com/en/produto',
    languages: { pt: 'https://banzami.com/produto' },
  },
};

// /en/produto — ported verbatim from handoff_site_completo/pages/Produto EN.dc.html.
export default function Page() {
  return (
    <SiteShell lang="en" current="produto">
      <ProdutoPage lang="en" />
    </SiteShell>
  );
}
