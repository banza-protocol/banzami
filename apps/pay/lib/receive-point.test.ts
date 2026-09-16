import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReceivePoint } from './api';
import { deepLink } from './deep-link';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getReceivePoint', () => {
  it('resolves via /v1/receive-points/{slug} and returns the payer-safe identity', async () => {
    let calledUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calledUrl = url;
      return new Response(
        JSON.stringify({
          slug: 'abc', display_name: 'Loja Teste', handle: 'loja',
          currency: 'AOA', status: 'ACTIVE', environment: 'SANDBOX',
        }),
        { status: 200 },
      );
    }));
    const point = await getReceivePoint('abc');
    expect(calledUrl).toContain('/v1/receive-points/abc');
    expect(point?.display_name).toBe('Loja Teste');
    expect(point?.status).toBe('ACTIVE');
  });

  it('returns null on 404 (unknown slug), never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await getReceivePoint('nope')).toBeNull();
  });

  it('encodes the slug into a single path segment', async () => {
    let calledUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calledUrl = url;
      return new Response('', { status: 404 });
    }));
    await getReceivePoint('../platform-mode');
    expect(calledUrl).not.toContain('/platform-mode');
    expect(calledUrl).toContain('%2F');
  });
});

describe('receive-point deep link', () => {
  it('is the environment scheme for pay/business/{slug}', () => {
    expect(deepLink('pay/business/abc', 'SANDBOX')).toBe('banzami-sandbox://pay/business/abc');
    expect(deepLink('pay/business/abc', 'LIVE')).toBe('banzami://pay/business/abc');
    expect(deepLink('pay/business/abc', null)).toBeNull();
  });
});
