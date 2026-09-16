// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { AppPinReset } from './app-pin-reset';

// BANZADMIN-IA-NAV-001 §14/§54 — the PIN reset card shows the true recipient
// (the access email) BEFORE sending, requires an explicit @handle confirmation
// and a reason, and never reveals a PIN.

afterEach(cleanup);

function renderCard(accessEmail?: string) {
  const api = { resetBusinessAppPin: vi.fn() } as never;
  render(<AppPinReset api={api} merchantId="m1" handle="doa" accessEmail={accessEmail} />);
  return api;
}

describe('AppPinReset', () => {
  it('shows the reset recipient (access email) before sending', () => {
    renderCard('sandbox+abc@projects.banzami.test');
    expect(screen.getByTestId('pin-reset-recipient').textContent).toContain('sandbox+abc@projects.banzami.test');
    // it is labelled as the access email, distinct from a contact email
    expect(screen.getByText(/email de acesso/i)).toBeTruthy();
  });

  it('falls back to a clear note when no access email is known', () => {
    renderCard(undefined);
    expect(screen.getByTestId('pin-reset-recipient').textContent).toMatch(/email de acesso da conta/i);
  });

  it('title names the App Banzami Business and shows no PIN value', () => {
    renderCard('a@b.co');
    expect(screen.getByText('PIN da App Banzami Business')).toBeTruthy();
    expect(document.body.textContent).not.toContain('••••');
  });

  it('send is disabled until the @handle confirmation and a reason are valid', () => {
    renderCard('a@b.co');
    const btn = screen.getByRole('button', { name: /Enviar link para novo PIN/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('@doa'), { target: { value: '@doa' } });
    expect(btn.disabled).toBe(true); // reason still empty
    fireEvent.change(screen.getByPlaceholderText(/precisa de um novo PIN/i), { target: { value: 'esqueceu o PIN' } });
    expect(btn.disabled).toBe(false);
  });

  it('a wrong @handle confirmation keeps send disabled', () => {
    renderCard('a@b.co');
    fireEvent.change(screen.getByPlaceholderText('@doa'), { target: { value: '@wrong' } });
    fireEvent.change(screen.getByPlaceholderText(/precisa de um novo PIN/i), { target: { value: 'motivo' } });
    expect((screen.getByRole('button', { name: /Enviar link para novo PIN/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
