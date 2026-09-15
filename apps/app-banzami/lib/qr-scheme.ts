// Canonical Banzami QR / deep-link scheme — the TS twin of
// sdk/flutter/lib/utils/qr_scheme.dart (the single source of truth). A generator
// emits ONLY the canonical scheme for its environment; Sandbox never emits a
// live scheme. The Web receive-QR must be byte-identical to the native one so a
// native app scans it and vice versa (WEB-APP-001 §48/§49/§50).
const LIVE = 'banzami';
const SANDBOX = 'banzami-sandbox';

export function qrScheme(isSandbox: boolean): string {
  return isSandbox ? SANDBOX : LIVE;
}

// `banzami-sandbox:@handle` — a P2P handle address.
export function handleQrPayload(handle: string, isSandbox: boolean): string {
  return `${qrScheme(isSandbox)}:@${handle.replace(/^@/, '')}`;
}

// Environment for the Web client: derived from the Consumer API base (the same
// signal the native app uses via its build flavor).
export function isSandboxEnv(): boolean {
  const base = process.env.CONSUMER_API_BASE ?? 'https://sandbox-api.banzami.com/consumer';
  return /sandbox/i.test(base);
}
