import type { Metadata } from 'next';
import { PrivacidadeContent } from '@/components/site/PrivacidadeContent';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Banzami handles the data collected in the tester programme.',
  alternates: {
    canonical: 'https://banzami.com/privacidade/en',
    languages: { pt: 'https://banzami.com/privacidade', en: 'https://banzami.com/privacidade/en' },
  },
};

export default function PrivacidadeEnPage() {
  return <PrivacidadeContent lang="en" />;
}
