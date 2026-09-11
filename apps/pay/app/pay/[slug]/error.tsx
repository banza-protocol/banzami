'use client';

import { startTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The payment-link page when the link could not be read.
 *
 * Any gateway answer other than 404 (a 5xx, a 429, a network failure) throws
 * from the server render. With no boundary here the payer got Next's default
 * English error page — at the moment they were about to pay. This says, in
 * Portuguese, that the link could not be loaded right now (not that it is
 * invalid: a definitive not-found is the not-found page), and retries the
 * server render rather than only the client tree.
 */
export default function PayLinkError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error('[pay/link] render error:', error.digest ?? error.message);
  }, [error]);

  const retry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-bg">
          <svg className="h-7 w-7 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Pagamento indisponível de momento</h1>
        <p className="mt-2 text-sm text-gray-400">
          Não foi possível carregar este link de pagamento. Tente novamente dentro de instantes.
        </p>
        <button
          onClick={retry}
          className="mt-6 w-full rounded-2xl bg-banzami py-3 text-sm font-semibold text-white active:bg-banzami-medium"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
