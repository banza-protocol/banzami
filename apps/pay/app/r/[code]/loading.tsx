export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-wine border-t-transparent" />
        <p className="text-sm text-gray-400">A carregar pedido…</p>
      </div>
    </main>
  );
}
