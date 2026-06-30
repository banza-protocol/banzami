export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Pedido inválido</h1>
        <p className="mt-2 text-sm text-gray-400">Esta ligação não existe ou expirou.</p>
        <a
          href="banzami://open"
          className="mt-6 inline-block w-full rounded-2xl bg-banzami py-3 text-sm font-semibold text-white active:bg-banzami-medium"
        >
          Abrir Banzami
        </a>
      </div>
    </main>
  );
}
