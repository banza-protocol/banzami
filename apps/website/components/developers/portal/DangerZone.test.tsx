// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmByName, DangerAction, DangerZone } from './DangerZone';

afterEach(cleanup);

const confirmButton = () => screen.getByRole('button', { name: 'Arquivar projeto' }) as HTMLButtonElement;
const field = () => screen.getByLabelText('Escreva o nome do projeto para confirmar') as HTMLInputElement;

const base = {
  title: 'Arquivar projeto',
  body: 'Arquivar retira a este projeto toda a autoridade.',
  name: 'Cleanroom journey',
  nameLabel: 'Escreva o nome do projeto para confirmar',
  confirmLabel: 'Arquivar projeto',
  onClose: () => {},
};

describe('ConfirmByName — the gate on an action that cannot be undone', () => {
  it('starts with the confirm inert, before anything is typed', () => {
    render(<ConfirmByName {...base} onConfirm={async () => {}} />);
    expect(confirmButton().disabled).toBe(true);
  });

  it('stays inert while the typed name is wrong', () => {
    const onConfirm = vi.fn(async () => {});
    render(<ConfirmByName {...base} onConfirm={onConfirm} />);

    // A near miss is the realistic mistake: the right project, the wrong one of
    // two similarly named ones.
    fireEvent.change(field(), { target: { value: 'Cleanroom journeys' } });
    expect(confirmButton().disabled).toBe(true);

    fireEvent.change(field(), { target: { value: 'cleanroom journey' } });
    expect(confirmButton().disabled, 'case is part of the name').toBe(true);

    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('enables only on the exact name, and tolerates the whitespace a paste carries', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<ConfirmByName {...base} onConfirm={onConfirm} />);

    fireEvent.change(field(), { target: { value: '  Cleanroom journey ' } });
    expect(confirmButton().disabled).toBe(false);

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('shows the name being typed, so this is a deliberate act and not a memory test', () => {
    render(<ConfirmByName {...base} onConfirm={async () => {}} />);
    expect(screen.getByText('Cleanroom journey')).toBeTruthy();
  });

  it('states the consequence before the action, not after it', () => {
    render(
      <ConfirmByName
        {...base}
        consequence="Este projeto tem 2 chaves e 14 pedidos registados."
        onConfirm={async () => {}}
      />,
    );
    expect(document.body.textContent).toContain('Este projeto tem 2 chaves e 14 pedidos registados.');
  });

  it('keeps a server refusal in the dialog instead of closing over it', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => {
      throw new Error('Este workspace ainda tem projetos ativos. Arquive-os primeiro.');
    });
    render(<ConfirmByName {...base} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.change(field(), { target: { value: 'Cleanroom journey' } });
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('ainda tem projetos ativos');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('cannot be fired twice while it is in flight', async () => {
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { release = r; }));
    render(<ConfirmByName {...base} onConfirm={onConfirm} />);

    fireEvent.change(field(), { target: { value: 'Cleanroom journey' } });
    fireEvent.click(confirmButton());

    const inFlight = await screen.findByRole('button', { name: 'A processar…' });
    expect((inFlight as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(inFlight);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    release();
  });

  it('closes on Escape, and refuses to abandon an action in flight', async () => {
    const onClose = vi.fn();
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const { rerender } = render(<ConfirmByName {...base} onConfirm={async () => {}} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<ConfirmByName {...base} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.change(field(), { target: { value: 'Cleanroom journey' } });
    fireEvent.click(confirmButton());
    await screen.findByRole('button', { name: 'A processar…' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    release();
  });
});

describe('DangerAction', () => {
  it('offers the action when there is one', () => {
    const onAction = vi.fn();
    render(
      <DangerZone>
        <DangerAction title="Eliminar projeto" description="Remove o projeto definitivamente." actionLabel="Eliminar projeto" onAction={onAction} />
      </DangerZone>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar projeto' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  // A greyed-out button says neither "you may not" nor "this is impossible".
  it('replaces the button with the reason, rather than disabling it', () => {
    render(
      <DangerZone>
        <DangerAction
          title="Eliminar projeto"
          description="Remove o projeto definitivamente."
          actionLabel="Eliminar projeto"
          onAction={() => {}}
          unavailableReason="Este projeto tem 2 chaves e 14 pedidos registados. Pode ser arquivado, não eliminado."
        />
      </DangerZone>,
    );
    expect(screen.queryByRole('button', { name: 'Eliminar projeto' })).toBeNull();
    expect(document.body.textContent).toContain('Pode ser arquivado, não eliminado.');
  });
});
