import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ApplicationStatusView } from './ApplicationStatusView';

export const metadata: Metadata = {
  title: 'Banzami Business — Estado da candidatura',
  description: 'Veja em que ponto está a sua candidatura ao Banzami Business e responda a pedidos de informação.',
  robots: { index: false, follow: false },
};

export default function ApplicationStatusPage() {
  return (
    <main className="min-h-screen bg-[#FFF7F6] px-6 pb-[60px] pt-7">
      <div className="mx-auto max-w-[760px]">
        <Suspense fallback={null}>
          <ApplicationStatusView />
        </Suspense>
      </div>
    </main>
  );
}
