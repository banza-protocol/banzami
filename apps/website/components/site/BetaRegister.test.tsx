// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Control the network. Everything else in @/lib/beta (the app list, the types)
// is real.
const { submitBetaRegistration } = vi.hoisted(() => ({ submitBetaRegistration: vi.fn() }));
vi.mock('@/lib/beta', async (orig) => ({
  ...(await orig<typeof import('@/lib/beta')>()),
  submitBetaRegistration,
}));

import { BetaRegisterForm } from './BetaRegisterForm';
import { BetaRegisterModal } from './BetaRegisterModal';

beforeEach(() => submitBetaRegistration.mockReset());
afterEach(cleanup);

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Primeiro nome/i), 'María-José');
  await user.type(screen.getByLabelText(/Último nome/i), "d'Almeida");
  await user.type(screen.getByLabelText(/E-mail utilizado/i), 'maria@example.com');
}

describe('BetaRegisterForm', () => {
  it('records a registration and shows an in-place success (no redirect)', async () => {
    submitBetaRegistration.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <BetaRegisterForm lang="pt" source="test" offeredApps={['APP_BANZAMI']} lockApp initialApps={['APP_BANZAMI']} initialPlatform="IOS" lockPlatform privacyHref="/privacidade" />,
    );
    await fillValid(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Participar nos testes|Quero participar/i }));

    await waitFor(() => expect(screen.getByText(/Inscrição recebida/i)).toBeTruthy());
    // The unicode name and store email were sent unchanged.
    expect(submitBetaRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'María-José', last_name: "d'Almeida", email: 'maria@example.com', platform: 'IOS', apps: ['APP_BANZAMI'] }),
    );
  });

  it('blocks submission without consent, and requires an app + platform on /testes', async () => {
    const user = userEvent.setup();
    render(<BetaRegisterForm lang="pt" source="test" privacyHref="/privacidade" />);
    await fillValid(user);
    // No platform, no app, no consent yet.
    await user.click(screen.getByRole('button', { name: /Participar nos testes/i }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(submitBetaRegistration).not.toHaveBeenCalled();
  });

  it('treats a duplicate the same as a new registration — a friendly success, no enumeration', async () => {
    // The backend answers 200 whether the email is new or already known, so the
    // client sees {ok:true} both times and shows the same confirmation. Nothing
    // in the UI reveals that the address already existed.
    submitBetaRegistration.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<BetaRegisterForm lang="pt" source="test" offeredApps={['APP_BANZAMI']} lockApp initialApps={['APP_BANZAMI']} initialPlatform="IOS" lockPlatform privacyHref="/privacidade" />);
    await fillValid(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Participar nos testes|Quero participar/i }));
    await waitFor(() => expect(screen.getByText(/Inscrição recebida/i)).toBeTruthy());
    expect(screen.queryByText(/já existe|already exists|duplicad/i)).toBeNull();
  });

  it('carries a hidden honeypot field that no sighted user sees', () => {
    render(<BetaRegisterForm lang="pt" source="test" privacyHref="/privacidade" />);
    const honeypot = document.querySelector('input[id$="-website"]') as HTMLInputElement | null;
    expect(honeypot).toBeTruthy();
    expect(honeypot!.tabIndex).toBe(-1);
  });
});

describe('BetaRegisterModal a11y', () => {
  it('is a labelled modal dialog, and Escape asks it to close', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BetaRegisterModal open onClose={onClose} title="Participar nos testes da App Banzami" labelledById="t">
        <button type="button">inside</button>
      </BetaRegisterModal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('t');
    expect(screen.getByText(/Participar nos testes da App Banzami/)).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape still closes after focus has left the panel (success unmounts the submit button)', () => {
    // The document-level Escape listener must fire even when the focused element
    // has moved to <body> — the exact gap the live modal had after the form was
    // replaced by its success state.
    const onClose = vi.fn();
    render(
      <BetaRegisterModal open onClose={onClose} title="t" labelledById="t">
        <button type="button">inside</button>
      </BetaRegisterModal>,
    );
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <BetaRegisterModal open={false} onClose={() => {}} title="x" labelledById="t">
        <span>hidden</span>
      </BetaRegisterModal>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
