// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NamePrompt } from './NamePrompt';

afterEach(cleanup);

/**
 * These are the four things window.prompt() could not do.
 *
 * Creating a workspace and a project — the first two actions of every new
 * developer — went through a native prompt. It has no test surface at all, so
 * none of this was covered, and the fourth case is how the defect was found:
 * an embedded browser suppresses the dialog and the Console silently did
 * nothing at the very first step of the journey.
 */
describe('NamePrompt — the control that replaced window.prompt', () => {
  const base = {
    title: 'Novo workspace',
    label: 'Nome',
    submitLabel: 'Criar',
    onClose: () => {},
  };

  it('is a real dialog that can be reached and read', () => {
    render(<NamePrompt {...base} onSubmit={async () => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Novo workspace');
    // The question is associated with the field, which a native prompt cannot do.
    expect(screen.getByLabelText('Nome')).toBe(document.activeElement);
  });

  it('refuses an empty name without asking the server', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<NamePrompt {...base} onSubmit={onSubmit} />);

    const submit = screen.getByRole('button', { name: 'Criar' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '   ' } });
    expect(submit.disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the server error on the field instead of losing it', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('Já existe um workspace com esse nome.');
    });
    const onClose = vi.fn();
    render(<NamePrompt {...base} onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Duplicado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Já existe um workspace com esse nome.');
    // The dialog stays open with the name still in it — a native prompt had
    // already closed by the time the API answered.
    const field = screen.getByLabelText('Nome') as HTMLInputElement;
    expect(field.value).toBe('Duplicado');
    expect(onClose).not.toHaveBeenCalled();
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

  it('trims and submits, then closes', async () => {
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<NamePrompt {...base} onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  A minha empresa  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('A minha empresa'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submits on Enter', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<NamePrompt {...base} onSubmit={onSubmit} />);

    const field = screen.getByLabelText('Nome');
    fireEvent.change(field, { target: { value: 'Enviado com Enter' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Enviado com Enter'));
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<NamePrompt {...base} onSubmit={async () => {}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
