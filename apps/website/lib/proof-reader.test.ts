import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROOF_READER_HEADER, proofReaderHeaders, readerIpFrom } from './proof-reader';

/**
 * A9-08. /r/{ref} is rendered on the website's server, so the gateway saw every
 * reader as the website and gave them one shared allowance — one client could
 * make verification unavailable for everybody. The website now names the reader
 * on its proof lookup; the gateway believes that only from the website.
 */

const hdrs = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe('readerIpFrom', () => {
  it('takes the address the website edge set in X-Real-IP', () => {
    expect(readerIpFrom(hdrs({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(readerIpFrom(hdrs({ 'x-real-ip': ' 2001:db8:1:2::7 ' }))).toBe('2001:db8:1:2::7');
  });
  it('forwards nothing that is not one address', () => {
    for (const v of ['', 'unknown', '198.51.100.7, 10.0.0.1', '198.51.100.7:443', '999.1.1.1', '1.2.3.4\r\nX-Evil: 1', 'fe80::1%eth0']) {
      expect(readerIpFrom(hdrs({ 'x-real-ip': v })), v).toBeUndefined();
    }
    expect(readerIpFrom(hdrs({}))).toBeUndefined();
  });
  it('never reads a header the caller controls end to end', () => {
    expect(readerIpFrom(hdrs({ 'x-forwarded-for': '198.51.100.9', 'cf-connecting-ip': '198.51.100.9' }))).toBeUndefined();
  });
});

describe('proofReaderHeaders', () => {
  it('is the reader header, or nothing', () => {
    expect(proofReaderHeaders('198.51.100.7')).toEqual({ [PROOF_READER_HEADER]: '198.51.100.7' });
    expect(proofReaderHeaders(undefined)).toEqual({});
    expect(proofReaderHeaders('not an ip')).toEqual({});
  });
  it('names the header the gateway reads', () => {
    const gw = readFileSync(resolve(__dirname, '../../../services/api-gateway/internal/config/config.go'), 'utf8');
    expect(gw).toContain(`const ProofReaderHeader = "${PROOF_READER_HEADER}"`);
  });
});

describe('getProof forwards the reader to the gateway', () => {
  let calls: { url: string; init?: RequestInit }[];
  beforeEach(() => {
    calls = [];
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/v1/platform-mode')) {
        return new Response(JSON.stringify({ mode: 'SANDBOX' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ exists: true, status: 'CONFIRMED' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const proofCall = () => calls.find((c) => c.url.includes('/v1/public/proofs/'));
  const sent = (c?: { init?: RequestInit }) => new Headers(c?.init?.headers).get(PROOF_READER_HEADER);

  it('sends the reader it was given', async () => {
    const { getProof } = await import('./api');
    await getProof('BZM-5EED-0A11', '198.51.100.7');
    expect(sent(proofCall())).toBe('198.51.100.7');
  });
  it('sends no reader header when it knows none', async () => {
    const { getProof } = await import('./api');
    await getProof('BZM-5EED-0A11');
    expect(proofCall()).toBeDefined();
    expect(sent(proofCall())).toBeNull();
  });
});

// The server page is where the request headers are; it must hand them on.
describe('the /r/{ref} page', () => {
  it('looks the proof up on the reader’s behalf', () => {
    const src = readFileSync(resolve(__dirname, '../app/r/[ref]/page.tsx'), 'utf8');
    expect(src).toMatch(/getProof\(ref,\s*readerIpFrom\(await headers\(\)\)\)/);
  });
});
