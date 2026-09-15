import { NextResponse } from 'next/server';
import { resolveHandle } from '@/lib/consumer-api';
import { readSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'sign in' }, { status: 401 });
  const { handle } = await ctx.params;
  const clean = handle.replace(/^@/, '').trim().toLowerCase();
  const r = await resolveHandle(clean, s.token);
  if (!r.ok) return NextResponse.json({ code: r.code, message: r.message }, { status: r.status });
  // Only what a payer needs to see — never internal ids beyond the handle/name.
  return NextResponse.json({ handle: r.data.handle, display_name: r.data.display_name ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
