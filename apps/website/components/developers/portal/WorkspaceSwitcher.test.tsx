// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Project, Workspace } from '@/lib/developer-api';

// The switcher reads everything from the data provider. The provider is the
// thing under test only in so far as it decides WHAT ARRIVES; what the selector
// then OFFERS is this component's decision, and that is what is asserted here.
const state = {
  workspaces: [] as Workspace[],
  activeWs: null as Workspace | null,
  projects: [] as Project[],
  activeProject: null as Project | null,
  showArchivedProjects: false,
  selectWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  selectProject: vi.fn(),
  createProject: vi.fn(),
  setShowArchivedProjects: vi.fn(),
  onApiError: () => 'Serviço indisponível. Tente novamente.',
};

vi.mock('./DeveloperData', () => ({
  useDeveloperData: () => state,
  isArchivedProject: (p: Project) => p.status === 'ARCHIVED',
}));
vi.mock('./Toast', () => ({ useToast: () => ({ flash: vi.fn() }) }));

const { WorkspaceSwitcher, projectOptions } = await import('./WorkspaceSwitcher');

const ws = (name: string): Workspace => ({
  id: `ws_${name}`, name, slug: name, status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z',
});
const prj = (name: string, status = 'ACTIVE'): Project => ({
  id: `prj_${name}`, workspace_id: 'ws_a', name, slug: name, status, created_at: '2026-01-01T00:00:00Z',
});

const live = prj('Integração de pagamentos');
const retired = prj('Piloto antigo', 'ARCHIVED');

beforeEach(() => {
  state.workspaces = [ws('a')];
  state.activeWs = state.workspaces[0];
  state.projects = [live, retired];
  state.activeProject = live;
  state.showArchivedProjects = false;
  state.setShowArchivedProjects.mockClear();
});
afterEach(cleanup);

const optionLabels = () =>
  [...(screen.getByLabelText('Projeto ativo') as HTMLSelectElement).options].map((o) => o.textContent);

describe('the project selector and archived projects', () => {
  it('leaves archived projects out by default', () => {
    render(<WorkspaceSwitcher />);
    const labels = optionLabels();
    expect(labels).toContain('Integração de pagamentos');
    expect(labels.some((l) => l?.includes('Piloto antigo'))).toBe(false);
  });

  it('offers them behind "Mostrar arquivados", and marks them as archived', () => {
    state.showArchivedProjects = true;
    render(<WorkspaceSwitcher />);
    expect(optionLabels()).toContain('Piloto antigo (arquivado)');
  });

  it('asks the provider for them when the affordance is pressed', () => {
    render(<WorkspaceSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar arquivados' }));
    expect(state.setShowArchivedProjects).toHaveBeenCalledWith(true);
  });

  // A select whose value is not among its options renders the wrong row as
  // selected, which is how someone ends up reading one project's settings and
  // archiving another.
  it('always represents the project that IS selected, archived or not', () => {
    state.activeProject = retired;
    render(<WorkspaceSwitcher />);
    expect(optionLabels()).toContain('Piloto antigo (arquivado)');
    expect((screen.getByLabelText('Projeto ativo') as HTMLSelectElement).value).toBe(retired.id);
  });

  it('says so when it is hiding archived projects it has been given', () => {
    render(<WorkspaceSwitcher />);
    expect(document.body.textContent).toContain('Há projetos arquivados que não estão listados.');
  });
});

describe('projectOptions', () => {
  it('is the one rule both the default and the affordance go through', () => {
    expect(projectOptions([live, retired], live, false).map((p) => p.name)).toEqual(['Integração de pagamentos']);
    expect(projectOptions([live, retired], live, true).map((p) => p.name)).toEqual([
      'Integração de pagamentos',
      'Piloto antigo',
    ]);
    expect(projectOptions([live, retired], retired, false).map((p) => p.name)).toEqual([
      'Integração de pagamentos',
      'Piloto antigo',
    ]);
  });
});

describe('the switcher speaks Portuguese', () => {
  it('labels its controls for someone reading them, not for the wire', () => {
    render(<WorkspaceSwitcher />);
    // The project field claimed "(SANDBOX)" — a deployment-wide constant
    // printed where it read as a fact about the selected project.
    expect(document.body.textContent).not.toMatch(/SANDBOX/);
    expect(screen.getByLabelText('Workspace ativo')).toBeTruthy();
    expect(screen.getByLabelText('Projeto ativo')).toBeTruthy();
    expect(optionLabels()).toContain('+ Novo projeto…');
  });
});
