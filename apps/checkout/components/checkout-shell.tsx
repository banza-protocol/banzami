interface CheckoutShellProps {
  children: React.ReactNode;
}

/**
 * Outer branded container — off-white page, centered card capped at 420px.
 * All checkout screens render inside this shell.
 */
export default function CheckoutShell({ children }: CheckoutShellProps) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-off-white px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-[420px]">{children}</div>
    </main>
  );
}
