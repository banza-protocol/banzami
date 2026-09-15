import { NextResponse } from 'next/server';
import { register } from '@/lib/consumer-api';
import { createSession, newCsrf } from '@/lib/session';
import { rateLimit, clientIp } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  // Registration is the easiest surface to abuse now that it is public (§111):
  // a small per-IP cap on top of the backend's own limits.
  if (!rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ code: 'RATE_LIMITED', message: 'demasiadas tentativas; tente mais tarde' }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { handle?: string; pin?: string; display_name?: string };
  const handle = (body.handle ?? '').trim().toLowerCase();
  const pin = (body.pin ?? '').trim();
  if (handle.length < 3 || handle.length > 30) {
    return NextResponse.json({ code: 'INVALID_HANDLE', message: 'o @banza deve ter entre 3 e 30 caracteres' }, { status: 400 });
  }
  if (!/^[0-9]{4,8}$/.test(pin)) {
    return NextResponse.json({ code: 'INVALID_PIN', message: 'o PIN deve ter entre 4 e 8 dígitos' }, { status: 400 });
  }
  const r = await register(handle, pin, body.display_name?.trim() || undefined);
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.status });
  const { consumer, token, expires_at } = r.data;
  await createSession({
    token,
    exp: Math.floor(new Date(expires_at).getTime() / 1000),
    consumerId: consumer.id,
    handle: consumer.handle,
    displayName: consumer.display_name ?? undefined,
    csrf: newCsrf(),
  });
  return NextResponse.json({ consumer: { id: consumer.id, handle: consumer.handle, display_name: consumer.display_name } }, { status: 201 });
}
