// The mobile beta programme (APP-BETA-001), client side.
//
// The apps — App Banzami (consumer) and App Comerciante (merchant) — are
// functional and given to invited testers through TestFlight (iOS) and Google
// Play testing (Android). This module holds the small amount the public pages
// and the inline modal share: the two apps, the platforms, the distribution
// truth, and the one call that records a registration.
//
// The endpoint (POST /v1/beta/testers on the gateway) needs no account and no
// auth, sends no email, and answers the same way whether the address was new or
// already known — so nothing here promises an immediate invite or leaks whether
// someone already registered.

import { API_BASE } from '@/lib/api';

export type BetaPlatform = 'IOS' | 'ANDROID' | 'BOTH';
export type BetaApp = 'APP_BANZAMI' | 'APP_MERCHANT';

// The two apps as the public pages present them. Both are on iOS and Android for
// invited testers (confirmed distribution truth) — TestFlight for iOS, Google
// Play testing for Android. This is NOT a public store listing: the apps are not
// downloadable from the App Store or Google Play, only through a tester invite.
export const BETA_APPS: {
  id: BetaApp;
  name: string;
  tagline_pt: string;
  tagline_en: string;
  ios: boolean;
  android: boolean;
}[] = [
  {
    id: 'APP_BANZAMI',
    name: 'App Banzami',
    tagline_pt: 'A carteira: pagar por QR e para um @banza, em Kwanza.',
    tagline_en: 'The wallet: pay by QR and to a @banza, in Kwanza.',
    ios: true,
    android: true,
  },
  {
    id: 'APP_MERCHANT',
    name: 'App Comerciante',
    tagline_pt: 'Receber por QR e por link, sem terminal.',
    tagline_en: 'Get paid by QR and by link, with no terminal.',
    ios: true,
    android: true,
  },
];

// The channel a platform is tested through, named correctly: TestFlight is
// Apple's, and Android is NOT "TestFlight" — it is Google Play testing.
export const PLATFORM_CHANNEL = {
  IOS: { label_pt: 'iPhone (TestFlight)', label_en: 'iPhone (TestFlight)', channel: 'TestFlight' },
  ANDROID: { label_pt: 'Android (Google Play)', label_en: 'Android (Google Play)', channel: 'Google Play testing' },
} as const;

export type BetaRegistration = {
  first_name: string;
  last_name: string;
  email: string;
  platform: BetaPlatform;
  apps: BetaApp[];
  device_model?: string;
  os_version?: string;
  country?: string;
  // Where the registration came from — the home hero, /testes, a product card.
  // Context for the operator, never authority.
  source?: string;
  // Honeypot: a field no human fills. The client always sends it empty; a filled
  // value is a bot and the server records nothing.
  website?: string;
};

export type BetaSubmitResult =
  | { ok: true }
  // A friendly, non-enumerating failure: the message never says whether the
  // email already exists.
  | { ok: false; message: string };

/**
 * Record a beta registration. The gateway answers 200 for both a new and an
 * already-known email (no enumeration), so a 200 is simply success. A 4xx is a
 * validation problem the person can fix; anything else is a try-again.
 */
export async function submitBetaRegistration(input: BetaRegistration): Promise<BetaSubmitResult> {
  try {
    const res = await fetch(`${API_BASE}/v1/beta/testers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: '', ...input }),
    });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => ({}) as { message?: string });
    if (res.status >= 400 && res.status < 500 && j.message) {
      return { ok: false, message: j.message };
    }
    return { ok: false, message: 'default' };
  } catch {
    return { ok: false, message: 'default' };
  }
}
