import type { Metadata } from 'next'
import { BanzamIAApp } from '@/components/banzamia/BanzamIAApp'
import { NoBodyScroll } from '@/components/NoBodyScroll'

export const metadata: Metadata = {
  title: 'BanzamIA — AI-native protocol intelligence',
  description:
    'BanzamIA is the AI-native interface for building, validating and certifying Banzami operators. Tools determine truth. AI explains truth.',
}

interface Props {
  searchParams: Promise<{ question?: string; auto?: string }>
}

export default async function BanzamIAPage({ searchParams }: Props) {
  const { question, auto } = await searchParams
  const initialQuestion = question ? decodeURIComponent(question) : undefined
  const autoSubmit = auto === '1'

  return (
    <>
      <NoBodyScroll />
      <div className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-hidden">
        <BanzamIAApp initialQuestion={initialQuestion} autoSubmit={autoSubmit} />
      </div>
    </>
  )
}
