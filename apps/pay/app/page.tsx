export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-banzami"
        >
          <span className="text-2xl font-bold text-white">B</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Banzami Pay</h1>
        <p className="mt-2 text-gray-400">
          Para pagar, aceda ao link enviado pelo comerciante.
        </p>
      </div>
    </main>
  );
}
