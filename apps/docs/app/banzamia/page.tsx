import type { Metadata } from 'next'
import { BanzamIAApp } from '@/components/banzamia/BanzamIAApp'

export const metadata: Metadata = {
  title: 'BanzamIA — AI-native protocol intelligence',
  description:
    'BanzamIA is the AI-native interface for building, validating and certifying Banzami operators. Tools determine truth. AI explains truth.',
}

export default function BanzamIAPage() {
  return (
    // Fixed overlay below the sticky header (h-14 = 3.5rem = 56px)
    <div className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-hidden">
      <BanzamIAApp />
    </div>
  )
}
