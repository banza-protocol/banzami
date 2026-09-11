// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const step1 = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/session', () => ({ saveSession: vi.fn() }));
vi.mock('@/lib/admin-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin-api')>()),
  adminLoginStep1: (...a: unknown[]) => step1(...a),
}));

import LoginPage from './page';
import { AdminApiError } from '@/lib/admin-api';

afterEach(() => { cleanup(); step1.mockReset(); });

async function submit() {
  render(<LoginPage />);
  const email = screen.getByPlaceholderText('operador@banzami.com');
  fireEvent.change(email, { target: { value: 'op@banzami.test' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••••••••••'), { target: { value: 'pw' } });
  fireEvent.submit(email.closest('form')!);
}

describe('login — a failing service is not a wrong password', () => {
  it.each([
    ['a 5xx', () => new AdminApiError(502, 'BAD_GATEWAY', 'upstream')],
    ['no answer at all', () => new TypeError('Failed to fetch')],
  ])('%s reads "indisponível"', async (_n, err) => {
    step1.mockRejectedValue(err());
    await submit();
    expect(await screen.findByText(/serviço de autenticação está indisponível/)).toBeTruthy();
    expect(screen.queryByText('Email ou palavra-passe inválidos.')).toBeNull();
  });

  it('a 401 stays the generic credentials message', async () => {
    step1.mockRejectedValue(new AdminApiError(401, 'UNAUTHORIZED', 'invalid credentials'));
    await submit();
    expect(await screen.findByText('Email ou palavra-passe inválidos.')).toBeTruthy();
  });
});
