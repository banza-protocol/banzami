// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmByName } from './DangerZone';

afterEach(cleanup);

/**
 * The dialog that guards deleting a Project or a Workspace (SANDBOX-DELETE-001
 * §28, §60): named and described for a screen reader, focus kept inside while
 * it is open and returned to the button that opened it, Escape to leave, the
 * name typed exactly, the running request announced, a refusal announced.
 */
const base = {
  title: 'Eliminar "Loja"?',
  body: 'Isto irá:',
  name: 'Loja',
  nameLabel: 'Escreva o nome do projeto para confirmar',
  confirmLabel: 'Eliminar projeto',
  busyLabel: 'A eliminar…',
};

function Opener({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Eliminar projeto…</button>
      <a href="#behind">atrás</a>
      {open ? <ConfirmByName {...base} onConfirm={onConfirm} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

describe('ConfirmByName — deleting a Sandbox resource', () => {
  it('is a modal dialog named by its title and described by its body', () => {
    render(<ConfirmByName {...base} onConfirm={async () => {}} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Eliminar "Loja"?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Isto irá:');
    expect(screen.getByLabelText(base.nameLabel)).toBe(document.activeElement);
  });

  it('confirms only with the exact name', () => {
    const onConfirm = vi.fn(async () => {});
    render(<ConfirmByName {...base} onConfirm={onConfirm} onClose={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Eliminar projeto' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText(base.nameLabel), { target: { value: 'Loj' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(base.nameLabel), { target: { value: 'Loja ' } });
    expect(confirm.disabled).toBe(false);
  });

  it('keeps Tab inside the dialog in both directions', () => {
    render(<Opener onConfirm={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar projeto…' }));
    const field = screen.getByLabelText(base.nameLabel);
    fireEvent.change(field, { target: { value: 'Loja' } });
    const confirm = screen.getByRole('button', { name: 'Eliminar projeto' });
    confirm.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('closes on Escape and gives focus back to the button that opened it', () => {
    render(<Opener onConfirm={async () => {}} />);
    const opener = screen.getByRole('button', { name: 'Eliminar projeto…' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('announces the running deletion and then a refusal', async () => {
    let refuse: (e: Error) => void = () => {};
    const onConfirm = () => new Promise<void>((_, reject) => { refuse = reject; });
    render(<ConfirmByName {...base} onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(base.nameLabel), { target: { value: 'Loja' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar projeto' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('A eliminar…'));
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
    // Escape does not abandon a deletion in flight.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    refuse(new Error('Não tem permissão para eliminar este projeto.'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não tem permissão para eliminar este projeto.'));
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBeNull();
  });
});
