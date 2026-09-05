// The origin the BROWSER calls. Baked into client bundles at build time, and the
// value the CSP connect-src is derived from.
const GATEWAY_URL         = process.env.NEXT_PUBLIC_GATEWAY_URL  ?? 'http://localhost:8080';
// Server-only — read at runtime, not baked at build time.
const STAGING_GATEWAY_URL = process.env.STAGING_GATEWAY_URL ?? 'http://public-api-staging:8083';

/**
 * The origin the SERVER calls, which is not the same thing.
 *
 * This container sits on an internal-only network with no external DNS: it is
 * the one Sandbox service with no secret, no database and no egress, and
 * granting it egress to reach a public hostname would widen the environment for
 * a page that only needs to read a payment. Server-side renders therefore reach
 * the gateway by its in-network name.
 *
 * Falls back to the public origin, so a local run with no internal network
 * behaves exactly as before.
 */
const SERVER_GATEWAY_URL  = process.env.GATEWAY_INTERNAL_URL ?? GATEWAY_URL;

/**
 * What `GET /public/pay/{slug}` actually returns — the payer-safe projection.
 *
 * This declared `id`, `merchant_id`, `wallet_id`, `created_at` and `updated_at`,
 * none of which the endpoint sends. A type that promises internal identifiers
 * the wire does not carry invites a page to render `undefined`, or worse invites
 * someone to make the server send them. The public payload is deliberately
 * narrow: enough to show the payer what they are paying, and nothing that names
 * the recipient's internal resources.
 */
export interface PaymentLink {
  slug:          string;
  merchant_name: string;
  amount_minor:  number | null;
  currency:      string;
  description:   string | null;
  status:        'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
  expires_at:    string | null;
  paid_at:       string | null;
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
  const res = await fetch(`${SERVER_GATEWAY_URL}/public/pay/${encodeURIComponent(slug)}`, {
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

/**
 * Platform Mode (Banzami ADR-025) — the environment router.
 *
 * Read server-side so a page can decide what to OFFER, not merely what to
 * label. Fails safe to SANDBOX: if the platform cannot be asked, the caller
 * must assume the more restricted environment, never the less.
 */
export async function getPlatformMode(): Promise<'LIVE' | 'SANDBOX'> {
  try {
    const res = await fetch(`${SERVER_GATEWAY_URL}/v1/platform-mode`, { cache: 'no-store' });
    if (!res.ok) return 'SANDBOX';
    const j = (await res.json()) as { mode?: string };
    return j.mode === 'LIVE' ? 'LIVE' : 'SANDBOX';
  } catch {
    return 'SANDBOX';
  }
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
  const res = await fetch(`${SERVER_GATEWAY_URL}/public/profiles/${encodeURIComponent(handle)}`, {
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
  // Injected by the route handler — reflects which backend was queried.
  environment:           'SANDBOX' | 'LIVE';
  expires_at:            string | null;
  created_at:            string;
  paid_at:               string | null;
}

export async function getConsumerPayLink(code: string, sandbox = false): Promise<ConsumerPayLink | null> {
  const base = sandbox ? STAGING_GATEWAY_URL : GATEWAY_URL;
  // public-api-staging uses /v1/ prefix; api-gateway (live) uses /public/ prefix.
  const path = sandbox
    ? `/v1/consumer-pay-links/${encodeURIComponent(code)}`
    : `/public/consumer-pay-links/${encodeURIComponent(code)}`;
  const res  = await fetch(
    `${base}${path}`,
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
