// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Control the network only; splitFullName, types and app list stay real.
const { submitBetaRegistration } = vi.hoisted(() => ({ submitBetaRegistration: vi.fn() }));
vi.mock('@/lib/beta', async (orig) => ({
  ...(await orig<typeof import('@/lib/beta')>()),
  submitBetaRegistration,
}));

import { HeroPlatforms } from './HeroPlatforms';

beforeEach(() => submitBetaRegistration.mockReset());
afterEach(cleanup);

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  render(<HeroPlatforms lang="pt" />);
  await user.click(screen.getByRole('button', { name: /iPhone/ }));
  expect(screen.getByText('Inscrição de tester')).toBeTruthy();
}

const nameField = () => screen.getByLabelText(/Nome completo/);
const emailField = () => screen.getByLabelText(/E-mail/);
const appBox = (name: string) => screen.getByRole('checkbox', { name });
const consentBox = () => screen.getByRole('checkbox', { name: /Programa Beta/ });
const submitBtn = () => screen.getByRole('button', { name: /Enviar inscrição/ });

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(nameField(), 'Fidel Monteiro');
  await user.type(emailField(), 'fidel@exemplo.ao');
  await user.click(consentBox()); // App Banzami is selected by default
}

describe('Tester sign-up — name validation', () => {
  it('a single word does not submit and shows a specific error', async () => {
    const user = userEvent.setup();
    await openModal(user);
    await user.type(nameField(), 'Fidel');
    await user.type(emailField(), 'fidel@exemplo.ao');
    await user.click(consentBox());
    await user.click(submitBtn());
    expect(submitBetaRegistration).not.toHaveBeenCalled();
    expect(screen.getByText('Introduza o seu nome completo, incluindo nome e apelido.')).toBeTruthy();
  });

  it('a first + last name is valid and submits', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(submitBtn());
    expect(submitBetaRegistration).toHaveBeenCalledTimes(1);
    expect(submitBetaRegistration.mock.calls[0][0]).toMatchObject({ first_name: 'Fidel', last_name: 'Monteiro' });
  });
});

describe('Tester sign-up — apps are an independent multi-select', () => {
  it('toggling one never clears the other, and both can be on at once', async () => {
    const user = userEvent.setup();
    await openModal(user);
    expect(appBox('App Banzami').getAttribute('aria-checked')).toBe('true'); // default
    expect(appBox('Banzami Business').getAttribute('aria-checked')).toBe('false');

    await user.click(appBox('Banzami Business'));
    expect(appBox('App Banzami').getAttribute('aria-checked')).toBe('true');
    expect(appBox('Banzami Business').getAttribute('aria-checked')).toBe('true');

    await user.click(appBox('App Banzami'));
    expect(appBox('App Banzami').getAttribute('aria-checked')).toBe('false');
    expect(appBox('Banzami Business').getAttribute('aria-checked')).toBe('true');
  });

  it('none selected does not submit and shows a specific error', async () => {
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(appBox('App Banzami')); // deselect the only one on
    await user.click(submitBtn());
    expect(submitBetaRegistration).not.toHaveBeenCalled();
    expect(screen.getByText('Selecione pelo menos uma app que pretende testar.')).toBeTruthy();
  });
});

describe('Tester sign-up — payload carries exactly the chosen apps', () => {
  it('App Banzami only', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(submitBtn());
    expect(submitBetaRegistration.mock.calls[0][0].apps).toEqual(['APP_BANZAMI']);
  });

  it('Banzami Business only', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(appBox('Banzami Business'));
    await user.click(appBox('App Banzami'));
    await user.click(submitBtn());
    expect(submitBetaRegistration.mock.calls[0][0].apps).toEqual(['APP_MERCHANT']);
  });

  it('both apps', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(appBox('Banzami Business'));
    await user.click(submitBtn());
    const sent = submitBetaRegistration.mock.calls[0][0].apps;
    expect([...sent].sort()).toEqual(['APP_BANZAMI', 'APP_MERCHANT']);
  });
});

describe('Tester sign-up — email & consent', () => {
  it('invalid email does not submit and shows a specific error', async () => {
    const user = userEvent.setup();
    await openModal(user);
    await user.type(nameField(), 'Fidel Monteiro');
    await user.type(emailField(), 'not-an-email');
    await user.click(consentBox());
    await user.click(submitBtn());
    expect(submitBetaRegistration).not.toHaveBeenCalled();
    expect(screen.getByText('Introduza um endereço de e-mail válido.')).toBeTruthy();
  });

  it('consent unchecked does not submit and shows a specific error', async () => {
    const user = userEvent.setup();
    await openModal(user);
    await user.type(nameField(), 'Fidel Monteiro');
    await user.type(emailField(), 'fidel@exemplo.ao');
    await user.click(submitBtn()); // consent left unchecked
    expect(submitBetaRegistration).not.toHaveBeenCalled();
    expect(screen.getByText('Confirme que aceita receber o convite e as comunicações do Programa Beta.')).toBeTruthy();
  });
});

describe('Tester sign-up — backend outcomes', () => {
  it('a generic backend failure shows the generic message and preserves the form', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: false, code: 'default' });
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(appBox('Banzami Business')); // both selected
    await user.click(submitBtn());
    expect(screen.getByText('Não foi possível enviar a inscrição. Tente novamente dentro de alguns instantes.')).toBeTruthy();
    // Data preserved for correction/retry.
    expect((nameField() as HTMLInputElement).value).toBe('Fidel Monteiro');
    expect((emailField() as HTMLInputElement).value).toBe('fidel@exemplo.ao');
    expect(appBox('App Banzami').getAttribute('aria-checked')).toBe('true');
    expect(appBox('Banzami Business').getAttribute('aria-checked')).toBe('true');
  });

  it('a known INVALID_EMAIL reason binds to the email field', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: false, code: 'INVALID_EMAIL' });
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(submitBtn());
    expect(screen.getByText('Introduza um endereço de e-mail válido.')).toBeTruthy();
  });

  it('success shows the confirmation', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await openModal(user);
    await fillValid(user);
    await user.click(submitBtn());
    expect(await screen.findByText('Inscrição recebida')).toBeTruthy();
  });
});

describe('Tester sign-up — multi-select accessibility', () => {
  it('the app cards are checkboxes, not a radio group', async () => {
    const user = userEvent.setup();
    await openModal(user);
    const group = screen.getByRole('group', { name: /Apps que quer testar/ });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(group).queryAllByRole('radio')).toHaveLength(0);
  });
});
