// PAY_API_URL: server-side gateway URL (non-NEXT_PUBLIC_ so docker-compose can't
// accidentally override it with a consumer-facing URL).
// Client bundles fall through to the hardcoded default (process.env.PAY_API_URL
// is replaced with `undefined` in browser bundles by Next.js).
const API_URL = process.env.PAY_API_URL ?? 'https://api.banzami.org';

export interface PaymentLink {
  id:            string;
  slug:          string;
  merchant_id:   string;
  merchant_name: string;
  wallet_id:     string;
  amount_minor:  number | null;
  currency:      string;
  description:   string | null;
  status:        'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
  expires_at:    string | null;
  paid_at:       string | null;
  created_at:    string;
  updated_at:    string;
}

export async function getPaymentLink(slug: string): Promise<PaymentLink | null> {
  const res = await fetch(`${API_URL}/public/pay/${encodeURIComponent(slug)}`, {
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Polling is always called from a client component; use the Next.js API route
// so the fetch happens server-side and avoids any browser CORS restrictions.
export async function getPaymentLinkStatus(slug: string): Promise<{ paid: boolean }> {
  const res = await fetch(`/api/pay/${encodeURIComponent(slug)}/status`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
