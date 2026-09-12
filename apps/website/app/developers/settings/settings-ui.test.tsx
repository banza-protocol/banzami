// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ApiError, type ProjectFootprint } from '@/lib/developer-api';
import {
  EnvironmentValue,
  RenameField,
  SettingsTabs,
  codeOf,
  detailsOf,
  environmentLabel,
  footprintPhrases,
  footprintSentence,
  messageFor,
} from './settings-ui';

afterEach(cleanup);

const footprint = (over: Partial<ProjectFootprint> = {}): ProjectFootprint => ({
  keys: 0, request_logs: 0, bindings: 0, deletable: true, blockers: [], ...over,
});

describe('what stands between a project and being deleted', () => {
  it('names the blockers with their counts, in the order the server named them', () => {
    const f = footprint({ keys: 2, request_logs: 14, deletable: false, blockers: ['API_KEYS', 'API_REQUESTS'] });
    expect(footprintSentence(f)).toBe('Este projeto tem 2 chaves e 14 pedidos registados.');
  });

  it('counts one of something as one of something', () => {
    const f = footprint({ keys: 1, deletable: false, blockers: ['API_KEYS'] });
    expect(footprintSentence(f)).toBe('Este projeto tem 1 chave.');
  });

  it('names all three', () => {
    const f = footprint({
      keys: 3, request_logs: 9, bindings: 1, deletable: false,
      blockers: ['FINANCIAL_SETUP', 'API_KEYS', 'API_REQUESTS'],
    });
    expect(footprintSentence(f)).toBe('Este projeto tem 1 ligação financeira, 3 chaves e 9 pedidos registados.');
  });

  // The phrases are built from blockers[], so a blocker this build has never
  // heard of is still shown rather than silently dropped from the sentence.
  it('still reports a blocker it does not recognise', () => {
    const f = footprint({ deletable: false, blockers: ['SOMETHING_NEW'] });
    expect(footprintPhrases(f)).toEqual(['SOMETHING_NEW']);
  });

  it('says plainly when there is nothing in the way', () => {
    expect(footprintSentence(footprint())).toMatch(/nunca emitiu uma chave/);
  });
});

describe('the environment, read rather than asserted', () => {
  it('shows what the deployment reported, and says whose property it is', () => {
    render(<EnvironmentValue reading={{ state: 'read', environment: 'SANDBOX' }} />);
    expect(screen.getByText('Sandbox')).toBeTruthy();
    expect(document.body.textContent).toMatch(/não deste projeto/);
  });

  // Defaulting to Sandbox is exactly what the hard-coded chips did.
  it('does not fall back to Sandbox when the deployment cannot say', () => {
    render(<EnvironmentValue reading={{ state: 'unreadable' }} />);
    expect(document.body.textContent).toContain('Não confirmado');
    // The badge — the thing read as a statement of fact — must not say it. The
    // prose below may, and does, to say it is NOT being assumed.
    expect(screen.queryByText('Sandbox')).toBeNull();
  });

  it('treats the server’s own UNAVAILABLE the same way', () => {
    render(<EnvironmentValue reading={{ state: 'read', environment: 'UNAVAILABLE' }} />);
    expect(document.body.textContent).toContain('Não confirmado');
    expect(document.body.textContent).toMatch(/Não assumimos Sandbox/);
  });

  it('does not claim an environment while it is still reading one', () => {
    render(<EnvironmentValue reading={{ state: 'loading' }} />);
    expect(document.body.textContent).toBe('A ler o ambiente…');
  });

  it('shows an environment name it has no word for, as the server said it', () => {
    expect(environmentLabel('STAGING')).toBe('STAGING');
  });
});

describe('refusals reach the reader intact', () => {
  // The provider's mapper knows six codes and turns everything else into
  // "Serviço indisponível", which is how the last owner was told the service
  // was down.
  it('prefers the refusal’s own sentence over the generic one', () => {
    const e = new ApiError('LAST_OWNER', 409, 'Não pode remover ou despromover o último proprietário.');
    expect(messageFor(e, 'Serviço indisponível. Tente novamente.')).toBe(
      'Não pode remover ou despromover o último proprietário.',
    );
    expect(codeOf(e)).toBe('LAST_OWNER');
  });

  it('carries the counts a conflict came with', () => {
    const e = new ApiError('WORKSPACE_NOT_EMPTY', 409, 'Este workspace ainda tem projetos ativos. Arquive-os primeiro.', {
      active_projects: 3,
    });
    expect(detailsOf(e).active_projects).toBe(3);
  });

  it('falls back to the generic message for something that is not an API refusal', () => {
    expect(messageFor(new TypeError('boom'), 'Sem ligação ao serviço.')).toBe('Sem ligação ao serviço.');
  });
});

describe('renaming', () => {
  it('sends the trimmed new name and closes', async () => {
    const onSave = vi.fn(async () => {});
    render(<RenameField label="NOME DO PROJETO" value="Piloto" onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Alterar' }));
    fireEvent.change(screen.getByLabelText('NOME DO PROJETO'), { target: { value: '  Integração  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Integração'));
  });

  it('will not save a name that has not changed, or an empty one', () => {
    render(<RenameField label="NOME DO PROJETO" value="Piloto" onSave={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alterar' }));

    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('NOME DO PROJETO'), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a refusal against the field', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('Não tem permissão para esta ação.');
    });
    render(<RenameField label="NOME DO PROJETO" value="Piloto" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alterar' }));
    fireEvent.change(screen.getByLabelText('NOME DO PROJETO'), { target: { value: 'Outro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não tem permissão para esta ação.');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });

  it('offers no rename control at all when the member may not rename, and says why', () => {
    render(
      <RenameField
        label="NOME DO WORKSPACE"
        value="A minha empresa"
        onSave={async () => {}}
        readOnlyReason="O seu papel neste workspace não permite renomear o workspace."
      />,
    );
    expect(screen.queryByRole('button', { name: 'Alterar' })).toBeNull();
    expect(document.body.textContent).toContain('não permite renomear o workspace');
  });
});

describe('which settings am I looking at', () => {
  it('marks the current surface and links to the other one', () => {
    render(<SettingsTabs active="workspace" />);
    const workspace = screen.getByRole('link', { name: 'Workspace' });
    const project = screen.getByRole('link', { name: 'Projeto' });
    expect(workspace.getAttribute('aria-current')).toBe('page');
    expect(project.getAttribute('aria-current')).toBeNull();
    expect(project.getAttribute('href')).toBe('/settings');
    expect(workspace.getAttribute('href')).toBe('/settings/workspace');
  });
});
