// Run: deploy as app/api/checkout/route.ts in a Next.js App Router project

import { NextRequest, NextResponse } from 'next/server';
import { BanzaClient }             from '@banza/sdk';

const banzami = new BanzaClient({
  baseUrl: process.env.BANZAMI_GATEWAY_URL!,
  apiKey:  process.env.BANZA_API_KEY!,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { amountMinor, description, orderId } = await req.json() as {
    amountMinor: number;
    description: string;
    orderId:     string;
  };

  const link = await banzami.createPaymentLink({
    merchantId:  process.env.BANZAMI_MERCHANT_ID!,
    walletId:    process.env.BANZAMI_WALLET_ID!,
    amountMinor,
    currency:    'AOA',
    description,
  });

  return NextResponse.json({
    checkoutUrl: `https://pay.banzami.org/${link.slug}`,
    linkId:      link.id,
  });
}
