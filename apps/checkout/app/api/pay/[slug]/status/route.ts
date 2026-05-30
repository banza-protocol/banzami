import { NextResponse } from 'next/server';

const API_URL = process.env.PAY_API_URL ?? 'https://api.banzami.com';

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  try {
    const res = await fetch(
      `${API_URL}/public/pay/${encodeURIComponent(params.slug)}/status`,
      { cache: 'no-store' },
    );
    if (!res.ok) return NextResponse.json({ paid: false });
    const data = (await res.json()) as { paid: boolean };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ paid: false });
  }
}
