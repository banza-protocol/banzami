import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeHandle,
  isValidHandleFormat,
  handleReasonMessage,
  isValidPin,
  checkHandle,
  submitApplication,
  validateActivation,
  completeActivation,
} from './api';

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('pure helpers', () => {
  it('normalizes handle: strips @, lowercases, trims', () => {
    expect(normalizeHandle('  @Cantina_Alex ')).toBe('cantina_alex');
    expect(normalizeHandle('@@LOJA')).toBe('loja');
  });

  it('validates handle format (no hyphen, 3-30)', () => {
    expect(isValidHandleFormat('cantina_alex')).toBe(true);
    expect(isValidHandleFormat('ab')).toBe(false); // too short
    expect(isValidHandleFormat('a-b')).toBe(false); // hyphen
    expect(isValidHandleFormat('_loja')).toBe(false); // starts with _
  });

  it('maps reason codes to messages', () => {
    expect(handleReasonMessage('TAKEN')).toMatch(/em uso/i);
    expect(handleReasonMessage('RESERVED')).toMatch(/reservado/i);
    expect(handleReasonMessage('PENDING')).toMatch(/candidatura/i);
    expect(handleReasonMessage('INVALID')).toMatch(/caracteres/i);
  });

  it('validates PIN 4-8 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
});

describe('check-handle', () => {
  it('available', async () => {
    mockFetch(200, { available: true });
    expect(await checkHandle('cantina_alex')).toEqual({ available: true });
  });
  it('taken with reason', async () => {
    mockFetch(200, { available: false, reason: 'TAKEN' });
    const r = await checkHandle('doa_sandbox');
    expect(r.available).toBe(false);
    expect(handleReasonMessage(r.reason)).toMatch(/em uso/i);
  });
});

describe('submit application', () => {
  const input = {
    desired_handle: 'cantina_alex',
    business_name: 'Cantina',
    email: 'a@b.co',
    terms_accepted: true,
  };
  it('success returns applicationId', async () => {
    mockFetch(201, { application_id: 'app-1', status: 'SUBMITTED' });
    const r = await submitApplication(input);
    expect(r.ok).toBe(true);
    expect(r.applicationId).toBe('app-1');
  });
  it('conflict (409) surfaces status', async () => {
    mockFetch(409, { code: 'HANDLE_TAKEN' });
    const r = await submitApplication(input);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });
});

describe('activation', () => {
  it('valid', async () => {
    mockFetch(200, { valid: true, reason: 'VALID', business_name: 'Loja', handle: 'loja' });
    const r = await validateActivation('tok');
    expect(r.valid).toBe(true);
    expect(r.business_name).toBe('Loja');
  });
  it('expired / used / invalid', async () => {
    for (const reason of ['EXPIRED', 'USED', 'INVALID']) {
      mockFetch(200, { valid: false, reason });
      expect((await validateActivation('tok')).reason).toBe(reason);
    }
  });
  it('complete success', async () => {
    mockFetch(200, { status: 'activated' });
    expect((await completeActivation('tok', '1234')).ok).toBe(true);
  });
  it('complete on used link → 410', async () => {
    mockFetch(410, { code: 'TOKEN_USED' });
    const r = await completeActivation('tok', '1234');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(410);
  });
});

describe('comerciantes CTAs point to the application form', () => {
  it('hero CTAs link to /comerciantes/candidatura, not mailto/#como', () => {
    const src = readFileSync(join(__dirname, '../app/comerciantes/page.tsx'), 'utf8');
    expect(src).toContain('href="/comerciantes/candidatura"');
    expect(src).not.toContain("mailto('Quero aceitar pagamentos')");
    expect(src).not.toContain('href="#como"');
  });
});
