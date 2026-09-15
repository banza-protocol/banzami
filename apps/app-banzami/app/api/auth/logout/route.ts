import { NextResponse } from 'next/server';
import { logout } from '@/lib/consumer-api';
import { readSession, destroySession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const s = await readSession();
  if (s) {
    // Best-effort backend revocation; the local session is cleared regardless.
    await logout(s.token).catch(() => {});
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
