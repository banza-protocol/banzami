import { NextRequest, NextResponse } from 'next/server';
import { getConsumerPayLink } from '@/lib/api';
import { serverEnvironment } from '@/lib/server-environment';

export const runtime = 'nodejs';

// This route answers with the live state of one payment request. It must never
// be served from a cache: a stale answer would show a payer a request that has
// already been paid, cancelled or expired. Next 15 stopped caching GET route
// handlers by default, but the default is not the guarantee — this is.
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  // Next 15: a route handler's params arrive as a Promise, exactly as a page's do.
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  // The server's own environment decides the backend and the label. A
  // `?sandbox=1` on the URL is ignored: it used to decide both, so any link
  // could be relabelled (A2-28).
  const environment = serverEnvironment();
  if (!environment) {
    console.error('[api/pay-link] server environment is not configured (PAY_ENVIRONMENT / NEXT_PUBLIC_GATEWAY_URL)');
    return NextResponse.json({ error: 'environment not configured' }, { status: 503 });
  }
  try {
    const link = await getConsumerPayLink(code, environment === 'SANDBOX');
    if (!link) return NextResponse.json(null, { status: 404 });
    return NextResponse.json({ ...link, environment });
  } catch (err) {
    console.error('[api/pay-link] upstream error:', err);
    return NextResponse.json({ error: 'upstream unavailable' }, { status: 502 });
  }
}
