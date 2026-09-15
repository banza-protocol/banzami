import { NextResponse } from 'next/server';
import { searchConsumers } from '@/lib/consumer-api';
import { readSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'sign in' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ consumers: [] });
  const r = await searchConsumers(q, s.token);
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.status });
  const list = (r.data.consumers ?? r.data.data ?? []).map((c) => ({ handle: c.handle, display_name: c.display_name ?? null }));
  return NextResponse.json({ consumers: list }, { headers: { 'Cache-Control': 'no-store' } });
}
