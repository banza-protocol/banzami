export default function PayIndexPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-off-white p-6">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-10 text-center shadow-card">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-7 w-7 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Link inválido</h1>
        <p className="mt-2 text-sm text-gray-400">
          Este URL de pagamento não é válido. Verifique o link que recebeu.
        </p>
        <p className="mt-6 text-xs text-gray-400">
          Powered by{' '}
          <span className="font-semibold text-wine">Banzami</span>
        </p>
      </div>
    </main>
  );
}
