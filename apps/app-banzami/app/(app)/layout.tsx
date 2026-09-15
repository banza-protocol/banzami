import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';
import { BottomNav } from '@/components/BottomNav';

export const dynamic = 'force-dynamic';

// The authenticated shell. A missing/expired session never renders app chrome —
// it is sent to sign-in. The column is phone-width and centred; on a phone it
// fills the screen (no nested mock phone, §10/§131).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await readSession();
  if (!s) redirect('/entrar');
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[520px] flex-col bg-cream-50">
      <div className="flex-1">{children}</div>
      <BottomNav />
    </div>
  );
}
