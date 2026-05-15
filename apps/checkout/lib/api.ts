const API_URL = process.env.NEXT_PUBLIC_PAY_API_URL ?? 'http://localhost:8083';

export interface PaymentLink {
  id:           string;
  slug:         string;
  merchant_id:  string;
  wallet_id:    string;
  amount_minor: number | null;
  currency:     string;
  description:  string | null;
  status:       'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
  expires_at:   string | null;
  paid_at:      string | null;
  created_at:   string;
  updated_at:   string;
}

export async function getPaymentLink(slug: string): Promise<PaymentLink | null> {
  const res = await fetch(`${API_URL}/v1/public/pay/${encodeURIComponent(slug)}`, {
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getPaymentLinkStatus(slug: string): Promise<{ paid: boolean }> {
  const res = await fetch(`${API_URL}/v1/public/pay/${encodeURIComponent(slug)}/status`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
