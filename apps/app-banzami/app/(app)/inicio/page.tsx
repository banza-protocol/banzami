import { readSession } from '@/lib/session';
import { getBalance, getActivity } from '@/lib/consumer-api';
import { HomeView } from '@/components/HomeView';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const s = (await readSession())!; // layout guarantees a session
  const [b, a] = await Promise.all([getBalance(s.token), getActivity(s.token)]);
  return (
    <HomeView
      handle={s.handle}
      displayName={s.displayName}
      initialBalance={b.ok ? b.data : null}
      initialActivity={a.ok ? a.data.items ?? [] : []}
    />
  );
}
