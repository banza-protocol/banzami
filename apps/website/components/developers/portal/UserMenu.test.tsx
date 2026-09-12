// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { UserMenu, initialsOf } from './UserMenu';

afterEach(cleanup);

/**
 * The header's account control, and the four things it got wrong.
 *
 * None of this was covered, which is how all four shipped: an avatar showing
 * `email.slice(0,2)` as if it were someone's initials, an avatar that signed
 * you out on a single click, a sign-out with no confirmation, and a sign-out
 * that reported success when the server had refused to revoke the session.
 *
 * The email used throughout is contacto@exemplo.ao — the first two characters
 * are "CO", which is exactly what the old avatar drew for every person at that
 * domain.
 */

const EMAIL = 'contacto@exemplo.ao';
const base = {
  onSetName: async () => {},
  onLogout: async () => {},
};

function open() {
  fireEvent.click(screen.getByRole('button', { name: /A sua conta/ }));
}

describe('initialsOf — initials belong to a person, not to an address', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Fidel Monteiro')).toBe('FM');
    expect(initialsOf('  ana   luísa  dias ')).toBe('AL');
    expect(initialsOf('Ana')).toBe('A');
  });

  it('answers null when there is no name, instead of inventing one', () => {
    expect(initialsOf('')).toBeNull();
    expect(initialsOf('   ')).toBeNull();
    expect(initialsOf(undefined)).toBeNull();
    expect(initialsOf(null)).toBeNull();
  });
});

describe('UserMenu — identity in the header', () => {
  it('draws the initials of the name', () => {
    render(<UserMenu {...base} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);
    const trigger = screen.getByRole('button', { name: /A sua conta/ });
    expect(trigger.textContent).toBe('FM');
  });

  it('draws a person glyph — never two letters of the email — when no name is set', () => {
    render(<UserMenu {...base} user={{ email: EMAIL, name: '' }} role={null} />);
    const trigger = screen.getByRole('button', { name: /A sua conta/ });

    // Not "CO". Not any pair of letters: there is no text in the avatar at all.
    expect(trigger.textContent).toBe('');
    expect(trigger.querySelector('svg')).toBeTruthy();
    expect(document.body.textContent).not.toContain('CO');

    // And the menu leads with the thing that would fix it.
    open();
    const items = screen.getAllByRole('menuitem');
    expect(items[0].textContent).toBe('Complete o seu nome');
    expect(document.body.textContent).not.toContain('CO');
  });

  it('writes out who is signed in, instead of hiding it in a tooltip', () => {
    render(<UserMenu {...base} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role="OWNER" />);
    open();
    // Visible text, not a title attribute — the old header put the email in one.
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.getByText('Fidel Monteiro')).toBeTruthy();
  });

  it('says the role in Portuguese, not in the wire vocabulary', () => {
    render(<UserMenu {...base} user={{ email: EMAIL }} role="DEVELOPER" />);
    open();
    expect(screen.getByText('Programador')).toBeTruthy();
    expect(screen.queryByText('Developer')).toBeNull();
  });

  it('shows no role at all when the role is not known — VIEWER would be a guess', () => {
    render(<UserMenu {...base} user={{ email: EMAIL }} role={null} />);
    open();
    for (const label of ['Proprietário', 'Administrador', 'Programador', 'Financeiro', 'Observador']) {
      expect(screen.queryByText(label), `${label} shown for an unknown role`).toBeNull();
    }
  });
});

describe('UserMenu — the avatar is a menu', () => {
  it('opens a menu and does not sign anyone out', () => {
    const onLogout = vi.fn(async () => {});
    render(<UserMenu {...base} onLogout={onLogout} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);

    const trigger = screen.getByRole('button', { name: /A sua conta/ });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // The whole defect: one click used to end the session.
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('moves focus into the menu, and Escape gives it back to the trigger', () => {
    render(<UserMenu {...base} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);
    const trigger = screen.getByRole('button', { name: /A sua conta/ });
    fireEvent.click(trigger);

    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(items[0], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps Tab inside the menu while it is open', () => {
    render(<UserMenu {...base} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);
    open();
    const items = screen.getAllByRole('menuitem');

    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(items[2]);
    // Past the last item it wraps to the first rather than escaping the layer.
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(items[2]);
  });

  it('closes when the click lands outside it', () => {
    render(<UserMenu {...base} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);
    open();
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('sets the name from inside the menu, and keeps a refusal on the field', async () => {
    const onSetName = vi
      .fn<(n: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('O nome não pode estar vazio e tem no máximo 80 caracteres.'))
      .mockResolvedValueOnce(undefined);
    render(<UserMenu {...base} onSetName={onSetName} user={{ email: EMAIL, name: '' }} role={null} />);
    open();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Complete o seu nome' }));
    const field = screen.getByLabelText('Nome') as HTMLInputElement;
    expect(document.activeElement).toBe(field);

    fireEvent.change(field, { target: { value: '  Fidel Monteiro  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('O nome não pode estar vazio');
    expect(onSetName).toHaveBeenCalledWith('Fidel Monteiro');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByLabelText('Nome')).toBeNull());
  });
});

describe('UserMenu — signing out is deliberate and honest', () => {
  it('asks before it ends the session, and cancelling leaves it alone', async () => {
    const onLogout = vi.fn(async () => {});
    render(<UserMenu {...base} onLogout={onLogout} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);
    open();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Terminar sessão' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Terminar sessão neste dispositivo?');
    expect(onLogout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Nothing was revoked, and the account control is still there to use.
    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /A sua conta/ })).toBeTruthy();
  });

  it('stays signed in, and says why, when the server could not revoke the session', async () => {
    // POST /auth/logout answers 503 and deliberately KEEPS the session cookie.
    const onLogout = vi.fn(async () => {
      throw new Error('Serviço indisponível. Tente novamente.');
    });
    render(<UserMenu {...base} onLogout={onLogout} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Terminar sessão' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar sessão' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Serviço indisponível.');
    // The session is still live server-side, so the Console still shows it as
    // live: the dialog is open and the account control is untouched.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /A sua conta/ })).toBeTruthy();
  });

  it('ends the session and closes when the server confirms', async () => {
    const onLogout = vi.fn(async () => {});
    render(<UserMenu {...base} onLogout={onLogout} user={{ email: EMAIL, name: 'Fidel Monteiro' }} role={null} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Terminar sessão' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar sessão' }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
