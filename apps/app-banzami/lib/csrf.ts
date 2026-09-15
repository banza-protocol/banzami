import 'server-only';
import { headers } from 'next/headers';
import type { Session } from '@/lib/session';

// CSRF for state-changing BFF routes (WEB-APP-001 §27). The session carries a
// per-session secret; a write must echo it in the X-CSRF-Token header. A GET
// never needs it. Same-origin fetches from the app attach it from a non-HttpOnly
// mirror cookie the app sets alongside the session.
export async function csrfOk(session: Session): Promise<boolean> {
  const h = await headers();
  const sent = h.get('x-csrf-token');
  return !!sent && !!session.csrf && timingSafeEqual(sent, session.csrf);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
