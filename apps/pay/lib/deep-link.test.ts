import { describe, it, expect } from 'vitest';
import { deepLink, schemeFor, LIVE_SCHEME, SANDBOX_SCHEME } from './deep-link';

// A8-11. Every payer page emitted `banzami://…` whatever stack it served. The
// app refuses a link of the other environment, so on the Sandbox the button did
// nothing — and on a Live build a Sandbox page's button would have opened a
// real-money payment prefilled from test data.
describe('the app link of this deployment', () => {
  it('names the Sandbox scheme on a Sandbox deployment', () => {
    expect(schemeFor('SANDBOX')).toBe(SANDBOX_SCHEME);
    expect(deepLink('pay/u/fm65', 'SANDBOX')).toBe('banzami-sandbox://pay/u/fm65');
  });

  it('names the live scheme on a Live deployment', () => {
    expect(schemeFor('LIVE')).toBe(LIVE_SCHEME);
    expect(deepLink('pay/link/abc', 'LIVE')).toBe('banzami://pay/link/abc');
  });

  it('guesses nothing when the environment is unknown', () => {
    expect(schemeFor(null)).toBeNull();
    expect(deepLink('open', null)).toBeNull();
  });

  it('never emits the other environment’s scheme', () => {
    expect(deepLink('pay/u/x', 'SANDBOX')?.startsWith('banzami://')).toBe(false);
    expect(deepLink('pay/u/x', 'LIVE')?.startsWith('banzami-sandbox://')).toBe(false);
  });
});
