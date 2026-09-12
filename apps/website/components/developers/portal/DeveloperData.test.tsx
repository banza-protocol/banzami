// @vitest-environment jsdom
/**
 * A rename must reach the screen.
 *
 * The provider kept the active workspace and project objects it already held
 * whenever a reload returned a row with the same id. That is right for identity
 * and wrong for content: the server renamed the workspace, the toast said so,
 * and the settings field, the sidebar selector and the top-bar chip all went on
 * showing the old name until someone pressed F5.
 *
 * The consequence was worse than cosmetic. The typed-name confirmation reads its
 * subject from these objects, so archiving straight after a rename printed the
 * stale name, sent the stale name, and the server — which compares the body's
 * name to the real one — refused. The developer had typed exactly what the
 * dialog told them to.
 *
 * Found by the 50-step browser journey (steps 8 and 17).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/developer-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/developer-api')>('@/lib/developer-api');
  return { ...actual, developerApi: { listWorkspaces: vi.fn(), listProjects: vi.fn() } };
});
// One stable object, as the real provider gives. Returning a fresh one per
// render changes onApiError's identity, which changes reloadProjects', which
// re-fires the effect that calls it — for ever. The real DeveloperAuth
// useCallbacks `clear`; a mock that does not is a mock that tests a loop.
const AUTH = { csrf: 'csrf', clear: () => {} };
vi.mock('./DeveloperAuth', () => ({ useDeveloperAuth: () => AUTH }));

import { developerApi } from '@/lib/developer-api';
import { DeveloperDataProvider, useDeveloperData } from './DeveloperData';

const api = developerApi as unknown as {
  listWorkspaces: ReturnType<typeof vi.fn>;
  listProjects: ReturnType<typeof vi.fn>;
};

const ws = (name: string) => ({ id: 'ws_1', name, slug: 'ws-1', status: 'ACTIVE', created_at: '2026-09-12T00:00:00Z' });
const prj = (name: string) => ({ id: 'prj_1', workspace_id: 'ws_1', name, slug: 'prj-1', status: 'ACTIVE', created_at: '2026-09-12T00:00:00Z' });

function Probe() {
  const { activeWs, activeProject, reloadWorkspaces, reloadProjects } = useDeveloperData();
  return (
    <div>
      <span data-testid="ws">{activeWs?.name ?? ''}</span>
      <span data-testid="prj">{activeProject?.name ?? ''}</span>
      <button type="button" onClick={() => void reloadWorkspaces()}>recarregar ws</button>
      <button type="button" onClick={() => void reloadProjects()}>recarregar prj</button>
    </div>
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  try { window.localStorage.clear(); } catch { /* a private window has none */ }
});

describe('DeveloperData — a reload takes the fresh row', () => {
  it('shows a renamed workspace without a page reload', async () => {
    api.listWorkspaces.mockResolvedValue({ workspaces: [ws('Antes')] });
    api.listProjects.mockResolvedValue({ projects: [prj('Projecto')] });

    render(<DeveloperDataProvider><Probe /></DeveloperDataProvider>);
    await waitFor(() => expect(screen.getByTestId('ws').textContent).toBe('Antes'));

    // The server renamed it. The id is unchanged — that is the whole point:
    // the old code matched on id and therefore kept the old object.
    api.listWorkspaces.mockResolvedValue({ workspaces: [ws('Depois')] });
    screen.getByRole('button', { name: 'recarregar ws' }).click();

    await waitFor(() => expect(screen.getByTestId('ws').textContent).toBe('Depois'));
  });

  it('shows a renamed project without a page reload', async () => {
    api.listWorkspaces.mockResolvedValue({ workspaces: [ws('WS')] });
    api.listProjects.mockResolvedValue({ projects: [prj('Antes')] });

    render(<DeveloperDataProvider><Probe /></DeveloperDataProvider>);
    await waitFor(() => expect(screen.getByTestId('prj').textContent).toBe('Antes'));

    api.listProjects.mockResolvedValue({ projects: [prj('Depois')] });
    screen.getByRole('button', { name: 'recarregar prj' }).click();

    await waitFor(() => expect(screen.getByTestId('prj').textContent).toBe('Depois'));
  });

  it('keeps the selection on the same resource — a rename is not a switch', async () => {
    api.listWorkspaces.mockResolvedValue({ workspaces: [ws('Antes'), { ...ws('Outro'), id: 'ws_2', slug: 'ws-2' }] });
    api.listProjects.mockResolvedValue({ projects: [prj('P')] });

    render(<DeveloperDataProvider><Probe /></DeveloperDataProvider>);
    await waitFor(() => expect(screen.getByTestId('ws').textContent).toBe('Antes'));

    api.listWorkspaces.mockResolvedValue({ workspaces: [ws('Depois'), { ...ws('Outro'), id: 'ws_2', slug: 'ws-2' }] });
    screen.getByRole('button', { name: 'recarregar ws' }).click();

    // Renamed, not replaced by the other workspace in the list.
    await waitFor(() => expect(screen.getByTestId('ws').textContent).toBe('Depois'));
  });
});
