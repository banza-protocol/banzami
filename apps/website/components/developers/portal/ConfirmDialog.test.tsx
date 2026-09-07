// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

/**
 * The behaviours window.confirm() could not provide on an irreversible action.
 *
 * Revoking an API key went through a native confirm. In an embedded browser the
 * dialog is suppressed, so the Revogar button silently did nothing — the key
 * stayed active while the Console reported nothing at all. That is how this was
 * found, and it is the last case below.
 */
describe('ConfirmDialog — the control that replaced window.confirm', () => {
  const base = {
    title: 'Revogar chave',
    body: 'A chave deixa de funcionar imediatamente.',
    confirmLabel: 'Revogar',
    onClose: () => {},
  };

  it('names the thing being destroyed', () => {
    render(<ConfirmDialog {...base} subject="Cleanroom journey · bz_test_sk_ab12…" onConfirm={async () => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Revogar chave');
    // A native confirm can only say "esta chave". This says which one.
    expect(screen.getByText('Cleanroom journey · bz_test_sk_ab12…')).toBeTruthy();
  });

  it('does not put focus on the destructive action', () => {
    render(<ConfirmDialog {...base} onConfirm={async () => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('confirms, then closes', async () => {
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('keeps a server refusal in the dialog instead of closing over it', async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error('Não tem acesso a este recurso.');
    });
    const onClose = vi.fn();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não tem acesso a este recurso.');
    // The dialog stays open. A native confirm had already closed, leaving the
    // row unchanged and the reason in a toast somewhere else.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('cannot be fired twice while it is in flight', async () => {
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { release = r; }));
    render(<ConfirmDialog {...base} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));
    // Both buttons go inert while the request is open: a second revoke would
    // 404 on a key that is already gone, and Cancelar would leave the caller
    // holding a promise nobody is waiting on.
    const inFlight = await screen.findByRole('button', { name: 'A processar…' });
    expect((inFlight as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(inFlight);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    release();
  });

  it('cancels on Escape, and refuses to abandon an action in flight', async () => {
    const onClose = vi.fn();
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const { rerender } = render(<ConfirmDialog {...base} onConfirm={async () => {}} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<ConfirmDialog {...base} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));
    await screen.findByRole('button', { name: 'A processar…' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1); // still just the first one
    release();
  });
});
