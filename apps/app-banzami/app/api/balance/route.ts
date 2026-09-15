import { NextResponse } from 'next/server';
import { getBalance } from '@/lib/consumer-api';
import { readSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'sign in' }, { status: 401 });
  const r = await getBalance(s.token);
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.status });
  return NextResponse.json(r.data, { headers: { 'Cache-Control': 'no-store' } });
}
