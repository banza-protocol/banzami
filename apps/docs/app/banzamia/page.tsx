import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BanzamIAApp } from '@/components/banzamia/BanzamIAApp'
import { NoBodyScroll } from '@/components/NoBodyScroll'

export const metadata: Metadata = {
  title: 'BanzamIA — AI-native protocol intelligence',
  description:
    'BanzamIA is the AI-native interface for building, validating and certifying Banzami operators. Tools determine truth. AI explains truth.',
}

export default function BanzamIAPage() {
  return (
    <>
      <NoBodyScroll />
      <div className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-hidden">
        {/* Suspense required because BanzamIAApp reads useSearchParams for ?question=...&auto=1 deep links */}
        <Suspense fallback={null}>
          <BanzamIAApp />
        </Suspense>
      </div>
    </>
  )
}
