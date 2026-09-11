import { describe, expect, it } from 'vitest';
import { AdminApiError } from '@/lib/admin-api';
import { actionErrorPt, failureReasonPt, isServiceUnavailable } from './errors';

describe('isServiceUnavailable — no answer is not a "no"', () => {
  it('5xx and network failures are unavailability; 4xx are answers', () => {
    expect(isServiceUnavailable(new AdminApiError(500, 'X', ''))).toBe(true);
    expect(isServiceUnavailable(new AdminApiError(503, 'MFA_UNAVAILABLE', ''))).toBe(true);
    expect(isServiceUnavailable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isServiceUnavailable(new AdminApiError(401, 'UNAUTHORIZED', ''))).toBe(false);
    expect(isServiceUnavailable(new AdminApiError(429, 'RATE', ''))).toBe(false);
  });
});

describe('failureReasonPt — one Portuguese reason per failure class', () => {
  it.each([
    [401, /sessão expirou/],
    [403, /permissão/],
    [404, /recarregue/],
    [409, /conflito/],
    [422, /recusado/],
    [400, /recusado/],
    [429, /Demasiados pedidos/],
    [500, /indisponível/],
    [503, /indisponível/],
  ])('%i', (status, re) => {
    expect(failureReasonPt(new AdminApiError(status, 'X', 'english text'))).toMatch(re);
  });

  it('a network failure (fetch TypeError) is "sem ligação", never an English message', () => {
    expect(failureReasonPt(new TypeError('Failed to fetch'))).toMatch(/Sem ligação/);
  });

  it('never echoes the server’s raw message', () => {
    expect(actionErrorPt(new AdminApiError(400, 'X', 'invalid body'), 'Falhou.')).not.toMatch(/invalid/);
  });
});
