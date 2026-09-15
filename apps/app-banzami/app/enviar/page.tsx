import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';
import { SendFlow } from '@/components/SendFlow';

export const dynamic = 'force-dynamic';

export default async function Enviar() {
  const s = await readSession();
  if (!s) redirect('/entrar');
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[520px] bg-cream-50">
      <SendFlow selfHandle={s.handle} />
    </main>
  );
}
