import { NextRequest, NextResponse } from 'next/server';
import { getConsumerPayLink } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const sandbox = req.nextUrl.searchParams.get('sandbox') === '1';
  try {
    const link = await getConsumerPayLink(params.code, sandbox);
    if (!link) return NextResponse.json(null, { status: 404 });
    // Inject environment — the server knows definitively which backend was queried.
    return NextResponse.json({ ...link, environment: sandbox ? 'SANDBOX' : 'LIVE' });
  } catch (err) {
    console.error('[api/pay-link] upstream error:', err);
    return NextResponse.json({ error: 'upstream unavailable' }, { status: 502 });
  }
}
