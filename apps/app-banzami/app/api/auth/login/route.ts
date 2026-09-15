import { NextResponse } from 'next/server';
import { login } from '@/lib/consumer-api';
import { createSession, newCsrf } from '@/lib/session';
import { rateLimit, clientIp } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  // Same authentication rate-limit floor as native (§110): a code-guessing cap.
  if (!rateLimit(`login:${ip}`, 15, 15 * 60 * 1000)) {
    return NextResponse.json({ code: 'RATE_LIMITED', message: 'demasiadas tentativas; tente mais tarde' }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { handle?: string; pin?: string };
  const handle = (body.handle ?? '').trim().toLowerCase();
  const pin = (body.pin ?? '').trim();
  if (!handle || !pin) {
    return NextResponse.json({ code: 'MISSING_FIELD', message: 'indique o @banza e o PIN' }, { status: 400 });
  }
  const r = await login(handle, pin);
  if (!r.ok) {
    // Never leak whether the handle exists vs the PIN is wrong.
    const msg = r.status === 401 || r.status === 404 ? '@banza ou PIN incorretos' : r.message;
    return NextResponse.json({ code: r.code, message: msg }, { status: r.status === 404 ? 401 : r.status });
  }
  const { consumer, token, expires_at } = r.data;
  // A fresh session on every sign-in — the pre-auth cookie never becomes the
  // authenticated one (session fixation, §26).
  await createSession({
    token,
    exp: Math.floor(new Date(expires_at).getTime() / 1000),
    consumerId: consumer.id,
    handle: consumer.handle,
    displayName: consumer.display_name ?? undefined,
    csrf: newCsrf(),
  });
  return NextResponse.json({ consumer: { id: consumer.id, handle: consumer.handle, display_name: consumer.display_name } });
}
