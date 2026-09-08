import type { Metadata } from 'next';
import PayRequestClient from './PayRequestClient';

interface Props {
  // Next 15: both arrive as Promises.
  params:       Promise<{ code: string }>;
  searchParams: Promise<{ sandbox?: string }>;
}

export function generateMetadata(): Metadata {
  return {
    title:       'Pedido de pagamento — Banzami',
    description: 'Pague de forma rápida e segura com o Banzami.',
  };
}

// Awaits its inputs and renders immediately — no data fetch, no streaming
// dependency. All state (loading / success / not_found / error / timeout) is
// owned by PayRequestClient via a same-origin API route fetch.
export default async function PaymentRequestPage({ params, searchParams }: Props) {
  const [{ code }, { sandbox }] = await Promise.all([params, searchParams]);
  return <PayRequestClient code={code} sandbox={sandbox === '1'} />;
}
