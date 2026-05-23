import type { Metadata } from 'next';
import PayRequestClient from './PayRequestClient';

interface Props {
  params:       { code: string };
  searchParams: { sandbox?: string };
}

export function generateMetadata(): Metadata {
  return {
    title:       'Pedido de pagamento — Banza',
    description: 'Pague de forma rápida e segura com o Banza.',
  };
}

// Sync RSC — renders immediately, no streaming dependency.
// All state (loading / success / not_found / error / timeout) is owned
// by PayRequestClient via a same-origin API route fetch.
export default function PaymentRequestPage({ params, searchParams }: Props) {
  const sandbox = searchParams.sandbox === '1';
  return <PayRequestClient code={params.code} sandbox={sandbox} />;
}
