// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * A workspace with no project must not be a dead end.
 *
 * Configurações returned early when no project was selected — before the tab
 * bar — so it rendered one sentence ("Escolha ou crie um projeto") and nothing
 * else. Definições do workspace, which is where the team is managed, where a
 * member leaves, and where a workspace is CLOSED, was unreachable from that
 * screen entirely.
 *
 * That is the state every workspace starts in and the state it returns to after
 * its last project closes, so the one screen able to end an empty workspace was
 * hidden exactly while the workspace was empty. The owner of "Cleanroom Dev"
 * found it with no project and no way to remove either.
 */

const activeProject: unknown = null;
vi.mock('@/components/developers/portal/DeveloperData', () => ({
  useDeveloperData: () => ({
    activeWs: { id: 'ws_1', name: 'Cleanroom Dev' },
    activeProject,
    prjLoad: 'ready',
    csrf: 'x',
    onApiError: () => 'err',
    reloadProjects: async () => {},
  }),
}));
vi.mock('@/components/developers/portal/Toast', () => ({ useToast: () => ({ flash: () => {} }) }));
vi.mock('@/components/developers/portal/PortalShell', () => ({
  PortalPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./settings-ui', async () => {
  const actual = await vi.importActual<typeof import('./settings-ui')>('./settings-ui');
  return {
    ...actual,
    useWorkspaceRole: () => ({ role: 'OWNER', load: 'ready' }),
    useProjectEnvironment: () => ({ state: 'loading' }),
    useProjectFootprint: () => ({ reading: { state: 'loading' }, reload: () => {} }),
  };
});

const { default: SettingsPage } = await import('./page');

afterEach(cleanup);

describe('Configurações with no project selected', () => {
  it('still shows the tabs, so workspace settings stay reachable', () => {
    render(<SettingsPage />);
    const tabs = screen.getByRole('navigation', { name: 'Configurações' });
    expect(tabs).toBeTruthy();
    const workspaceTab = Array.from(tabs.querySelectorAll('a')).find((a) => /workspace/i.test(a.textContent ?? ''));
    expect(workspaceTab).toBeTruthy();
    expect(workspaceTab!.getAttribute('href')).toBe('/settings/workspace');
  });

  it('says why there is nothing to configure, and where to close an empty workspace', () => {
    render(<SettingsPage />);
    expect(screen.getByText(/Nenhum projeto selecionado/)).toBeTruthy();
    // The way out is named, not merely linked: the reader is told that a
    // workspace WITHOUT projects is closed from there.
    expect(screen.getByText(/incluindo um workspace sem projetos/)).toBeTruthy();
    const links = Array.from(document.querySelectorAll('a')).filter((a) => a.getAttribute('href') === '/settings/workspace');
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it('offers no project danger zone when there is no project', () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/Eliminar projeto/)).toBeNull();
    expect(screen.queryByText(/Arquivar projeto/)).toBeNull();
  });
});
