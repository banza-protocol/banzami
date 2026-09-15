import { NextResponse } from 'next/server';
import { createTransfer, listTransfers } from '@/lib/consumer-api';
import { readSession } from '@/lib/session';
import { csrfOk } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'sign in' }, { status: 401 });
  const r = await listTransfers(s.token);
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.status });
  return NextResponse.json(r.data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'sign in' }, { status: 401 });
  if (!(await csrfOk(s))) return NextResponse.json({ code: 'CSRF', message: 'pedido inválido' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    recipient?: string; amount_minor?: number; note?: string; idempotency_key?: string;
  };
  const recipient = (body.recipient ?? '').trim();
  const amount = Number(body.amount_minor);
  // The client supplies one idempotency key per send intent and reuses it on
  // retry, so a double-click or a network retry converges on ONE transfer
  // (§64/§65/§127). A missing key is rejected rather than silently unguarded.
  const key = (body.idempotency_key ?? '').trim();
  if (!recipient) return NextResponse.json({ code: 'MISSING_FIELD', message: 'indique o destinatário' }, { status: 400 });
  if (!Number.isInteger(amount) || amount <= 0) return NextResponse.json({ code: 'INVALID_AMOUNT', message: 'valor inválido' }, { status: 400 });
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) return NextResponse.json({ code: 'MISSING_IDEMPOTENCY', message: 'pedido inválido' }, { status: 400 });

  const r = await createTransfer(
    s.token,
    { recipient: recipient.startsWith('@') ? recipient : `@${recipient}`, amount_minor: amount, note: body.note },
    key,
  );
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.status });
  return NextResponse.json(r.data, { headers: { 'Cache-Control': 'no-store' } });
}
