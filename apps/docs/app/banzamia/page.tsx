import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BanzAIApp } from '@/components/banzai/BanzAIApp'
import { NoBodyScroll } from '@/components/NoBodyScroll'

export const metadata: Metadata = {
  title: 'BanzAI — Protocol Operating System',
  description:
    'BanzAI é o Sistema Operativo do Protocolo Banza. 16 módulos. Compreender, Explicar, Validar, Simular, Prever, Guiar, Certificar, Federar. Ferramentas determinam a verdade. A IA explica a verdade.',
}

export default function BanzAIPage() {
  return (
    <>
      <NoBodyScroll />
      <div className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-hidden">
        {/* Suspense required because BanzAIApp reads useSearchParams for ?question=...&auto=1 deep links */}
        <Suspense fallback={null}>
          <BanzAIApp />
        </Suspense>
      </div>
    </>
  )
}
