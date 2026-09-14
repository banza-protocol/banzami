import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('keeps a Console path with its query', () => {
    expect(safeReturnPath('/explorer?op=createPaymentSession')).toBe('/explorer?op=createPaymentSession');
    expect(safeReturnPath('/webhooks')).toBe('/webhooks');
  });
  it('never becomes an open redirect', () => {
    const nul = String.fromCharCode(0);
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example/x', 'javascript:alert(1)', 'evil.example', '/%0d%0aLocation:x', `/a${nul}b`, '']) {
      const out = safeReturnPath(bad);
      expect(out.startsWith('/')).toBe(true);
      expect(out.startsWith('//')).toBe(false);
      expect(new URL(out, 'https://developers.banzami.com').origin).toBe('https://developers.banzami.com');
    }
    expect(safeReturnPath('//evil.example')).toBe('/');
    expect(safeReturnPath('https://evil.example/x')).toBe('/');
    expect(safeReturnPath(`/a${nul}b`)).toBe('/');
  });
  it('does not loop back into sign-in', () => {
    expect(safeReturnPath('/login?next=/x')).toBe('/');
    expect(safeReturnPath('/verify?email=a')).toBe('/');
  });
});
