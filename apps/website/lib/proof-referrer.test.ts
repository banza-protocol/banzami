import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config.mjs';

// Next applies every matching rule in order; for one header key the last wins.
async function referrerPolicy(path: string): Promise<string | undefined> {
  let value: string | undefined;
  type Rule = { source: string; headers: { key: string; value: string }[] };
  for (const rule of (await nextConfig.headers!()) as Rule[]) {
    const re = new RegExp('^' + rule.source.replace(':path*', '.*') + '$');
    if (!re.test(path)) continue;
    for (const h of rule.headers) if (h.key.toLowerCase() === 'referrer-policy') value = h.value;
  }
  return value;
}

describe('a proof page sends no Referer', () => {
  it('/r/<ref> and /r/_ are no-referrer', async () => {
    expect(await referrerPolicy('/r/BZM-7K2M-9QXR')).toBe('no-referrer');
    expect(await referrerPolicy('/r/_')).toBe('no-referrer');
  });
  it('other pages keep the site policy', async () => {
    expect(await referrerPolicy('/verificar')).toBe('strict-origin-when-cross-origin');
    expect(await referrerPolicy('/')).toBe('strict-origin-when-cross-origin');
  });
});
