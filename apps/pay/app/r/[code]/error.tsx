'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('[pay/r] render error:', error); }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-bg">
          <svg className="h-7 w-7 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Erro de ligação</h1>
        <p className="mt-2 text-sm text-gray-400">Não foi possível carregar o pedido.</p>
        <button
          onClick={reset}
          className="mt-6 w-full rounded-2xl bg-wine py-3 text-sm font-semibold text-white active:bg-wine-medium"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
