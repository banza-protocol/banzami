import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BanzAIApp } from '@/components/banzai/BanzAIApp'
import { NoBodyScroll } from '@/components/NoBodyScroll'

export const metadata: Metadata = {
  title: 'BanzAI — Protocol Operating System',
  description:
    'BanzAI is the BANZA Protocol Operating System. ' +
    'Understand, Explain, Validate, Simulate, Evaluate, Federate. ' +
    'BANZA defines. BANZA certifies. BanzAI evaluates. Operators implement. ' +
    'Tools determine truth. AI explains truth.',
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
