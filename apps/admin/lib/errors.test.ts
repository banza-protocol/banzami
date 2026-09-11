import { describe, expect, it } from 'vitest';
import { AdminApiError } from '@/lib/admin-api';
import { actionErrorPt, failureReasonPt } from './errors';

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
