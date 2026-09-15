import type { Metadata } from 'next';
import { PrivacidadeContent } from '@/components/site/PrivacidadeContent';

export const metadata: Metadata = {
  title: 'Privacidade',
  description: 'Como a Banzami trata os dados recolhidos no programa de testers.',
  alternates: {
    canonical: 'https://banzami.com/privacidade',
    languages: { pt: 'https://banzami.com/privacidade', en: 'https://banzami.com/privacidade/en' },
  },
};

export default function PrivacidadePage() {
  return <PrivacidadeContent lang="pt" />;
}
