const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:8080';

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

export interface PaymentInstructions {
  method:    string;
  entity:    string;
  reference: string;
}

export interface AcquiringPayment {
  id:            string;
  payment_link_id: string;
  provider:      string;
  external_ref:  string;
  status:        'PENDING' | 'CONFIRMED' | 'FAILED';
  amount_minor:  number;
  currency:      string;
  instructions:  PaymentInstructions;
  expires_at:    string;
  created_at:    string;
  confirmed_at:  string | null;
}

export async function getPaymentLink(slug: string): Promise<PaymentLink | null> {
  const res = await fetch(`${GATEWAY_URL}/public/pay/${encodeURIComponent(slug)}`, {
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getPaymentLinkStatus(slug: string): Promise<{ paid: boolean }> {
  const res = await fetch(`${GATEWAY_URL}/public/pay/${encodeURIComponent(slug)}/status`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function initiatePay(
  slug:        string,
  amountMinor?: number,
): Promise<AcquiringPayment> {
  const body = amountMinor != null ? JSON.stringify({ amount_minor: amountMinor }) : '{}';
  const res  = await fetch(`${GATEWAY_URL}/public/pay/${encodeURIComponent(slug)}/pay`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    cache:   'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `API error ${res.status}`);
  }
  return res.json();
}

export interface SocialLink {
  platform: string;
  url:      string;
}

export interface MerchantProfile {
  id:           string;
  merchant_id:  string;
  handle:       string;
  display_name: string;
  tagline:      string | null;
  description:  string | null;
  category:     string | null;
  logo_url:     string | null;
  cover_url:    string | null;
  public:       boolean;
  wallet_id:    string | null;
  social_links: SocialLink[];
  created_at:   string;
  updated_at:   string;
}

export async function getMerchantProfile(handle: string): Promise<MerchantProfile | null> {
  const res = await fetch(`${GATEWAY_URL}/public/profiles/${encodeURIComponent(handle)}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface ConsumerPayLink {
  id:                    string;
  link_code:             string;
  receiver_consumer_id:  string;
  receiver_handle:       string;
  receiver_display_name: string | null;
  amount_minor:          number | null;
  note:                  string | null;
  currency:              string;
  locked:                boolean;
  status:                'ACTIVE' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  expires_at:            string | null;
  created_at:            string;
  paid_at:               string | null;
}

export async function getConsumerPayLink(code: string): Promise<ConsumerPayLink | null> {
  const res = await fetch(
    `${GATEWAY_URL}/public/consumer-pay-links/${encodeURIComponent(code)}`,
    { next: { revalidate: 0 } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function formatAmount(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  if (currency.toUpperCase() === 'AOA') {
    return `${major.toLocaleString('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;
  }
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency, minimumFractionDigits: 2 }).format(major);
}
