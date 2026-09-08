import { NextRequest, NextResponse } from 'next/server';
import { getConsumerPayLink } from '@/lib/api';

export const runtime = 'nodejs';

// This route answers with the live state of one payment request. It must never
// be served from a cache: a stale answer would show a payer a request that has
// already been paid, cancelled or expired. Next 15 stopped caching GET route
// handlers by default, but the default is not the guarantee — this is.
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  // Next 15: a route handler's params arrive as a Promise, exactly as a page's do.
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const sandbox = req.nextUrl.searchParams.get('sandbox') === '1';
  try {
    const link = await getConsumerPayLink(code, sandbox);
    if (!link) return NextResponse.json(null, { status: 404 });
    // Inject environment — the server knows definitively which backend was queried.
    return NextResponse.json({ ...link, environment: sandbox ? 'SANDBOX' : 'LIVE' });
  } catch (err) {
    console.error('[api/pay-link] upstream error:', err);
    return NextResponse.json({ error: 'upstream unavailable' }, { status: 502 });
  }
}
