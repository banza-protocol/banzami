/**
 * How a payer who does not have the Banzami app can get in, from the pay page.
 *
 * The app is a private, invite-only beta today (APP-BETA-001): iOS is given to
 * invited testers through TestFlight (not a public App Store listing), and native
 * Android tester distribution is not available yet. The Beta Web runs the app in
 * the browser with no install. So the pay page never links a store it cannot
 * honour — it routes to the real obtain path per platform, and this module is the
 * single place that decides it.
 *
 * Distribution truth lives on banzami.com (apps/website lib/public-truth appBeta);
 * these are the minimal destinations the pay page needs, kept here so no store URL
 * is hard-coded inside the component. When the public App Store release exists,
 * set ios.distribution = 'APP_STORE' and ios.installUrl — no payment logic
 * depends on any of this.
 */

export type Platform = 'ios' | 'android' | 'desktop';
export type IosDistribution = 'TESTFLIGHT' | 'APP_STORE';
export type AndroidDistribution = 'UNAVAILABLE' | 'TESTING' | 'PLAY_STORE';

export const INSTALL_CONFIG = {
  // The invite-only beta sign-up (a tester registers and receives a TestFlight
  // invite) and the in-browser Beta Web.
  betaSignupUrl: 'https://banzami.com/testes',
  betaWebUrl: 'https://app.banzami.com',
  ios: {
    // TestFlight is invite-only, so there is no public install URL today: iOS
    // routes to the beta sign-up. Switch to 'APP_STORE' + installUrl on the
    // public release.
    distribution: 'TESTFLIGHT' as IosDistribution,
    installUrl: '' as string,
  },
  android: {
    // Native Android tester distribution is not available. Never a Play link.
    distribution: 'UNAVAILABLE' as AndroidDistribution,
    installUrl: '' as string,
  },
} as const;

/**
 * Lightweight platform detection for choosing the obtain destination only — never
 * a security boundary (server-side payment validation stays authoritative). An
 * iPadOS Safari that reports as a Mac with touch is treated as iOS.
 */
export function detectPlatform(ua?: string, maxTouchPoints?: number): Platform {
  const s = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const touch = maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);
  if (/iPhone|iPad|iPod/i.test(s)) return 'ios';
  // iPadOS 13+ Safari presents a Mac UA; disambiguate by touch points.
  if (/Macintosh/i.test(s) && (touch ?? 0) > 1) return 'ios';
  if (/Android/i.test(s)) return 'android';
  return 'desktop';
}

export type InstallOption = {
  platform: Platform;
  /** Optional lead-in shown before the CTA (iOS: "Ainda não tem a app?"). */
  prompt?: string;
  /** The explanatory sentence (Android unavailable / desktop Beta Web). */
  message?: string;
  /** The secondary-CTA label — never "Instalar"/"Obter" when it is not an install. */
  ctaLabel: string;
  /** Where the CTA goes. Always an external, new-tab destination here. */
  href: string;
  /** For the accessible label: what the destination is. */
  destination: 'beta_signup' | 'beta_web' | 'app_store';
};

/**
 * The obtain path for a platform. Pure: the pay page renders whatever this
 * returns, so the copy and destination per platform live in one place.
 *
 *   iOS      — invite-only TestFlight today → "Obter a app Banzami" to the beta
 *              sign-up (or the App Store once ios.distribution is APP_STORE).
 *   Android  — unavailable → a plain notice + "Participar no Beta" to the sign-up,
 *              never a Play Store link.
 *   desktop  — "Abrir Banzami no navegador" to the Beta Web (no install).
 */
export function installOption(platform: Platform): InstallOption {
  const { betaSignupUrl, betaWebUrl, ios } = INSTALL_CONFIG;
  switch (platform) {
    case 'ios':
      if (ios.distribution === 'APP_STORE' && ios.installUrl) {
        return { platform, prompt: 'Ainda não tem a app?', ctaLabel: 'Obter a app Banzami', href: ios.installUrl, destination: 'app_store' };
      }
      return { platform, prompt: 'Ainda não tem a app?', ctaLabel: 'Obter a app Banzami', href: betaSignupUrl, destination: 'beta_signup' };
    case 'android':
      return {
        platform,
        message: 'A app Banzami para Android está temporariamente indisponível.',
        ctaLabel: 'Participar no Beta',
        href: betaSignupUrl,
        destination: 'beta_signup',
      };
    case 'desktop':
    default:
      return {
        platform,
        message: 'Pode utilizar a Banzami diretamente no navegador.',
        ctaLabel: 'Abrir Banzami no navegador',
        href: betaWebUrl,
        destination: 'beta_web',
      };
  }
}

/** The accessible suffix naming the external destination, for screen readers. */
export function destinationLabel(d: InstallOption['destination']): string {
  switch (d) {
    case 'app_store': return 'abre a App Store';
    case 'beta_web': return 'abre app.banzami.com numa nova aba';
    case 'beta_signup':
    default: return 'abre banzami.com/testes numa nova aba';
  }
}
