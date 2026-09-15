import { describe, it, expect } from 'vitest';
import { qrScheme, handleQrPayload } from './qr-scheme';

describe('Banzami QR scheme — cross-client parity', () => {
  it('emits the canonical scheme per environment', () => {
    expect(qrScheme(true)).toBe('banzami-sandbox');
    expect(qrScheme(false)).toBe('banzami');
  });
  it('produces the exact handle payload the native app scans', () => {
    // sdk/flutter qr_scheme.dart: `${scheme}:@${handle}`
    expect(handleQrPayload('ana', true)).toBe('banzami-sandbox:@ana');
    expect(handleQrPayload('@ana', true)).toBe('banzami-sandbox:@ana');
    expect(handleQrPayload('ana', false)).toBe('banzami:@ana');
  });
});
