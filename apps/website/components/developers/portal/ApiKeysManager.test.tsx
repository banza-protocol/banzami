// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { ApiKey } from '@/lib/developer-api';

const api = vi.hoisted(() => ({
  listKeys: vi.fn(),
  createKey: vi.fn(),
  rotateKey: vi.fn(),
  revokeKey: vi.fn(),
}));
vi.mock('@/lib/developer-api', () => ({ developerApi: api, ApiError: class extends Error {} }));

const ctx = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('./DeveloperData', () => ({ useDeveloperData: () => ctx.value }));

import {
  ApiKeysManager,
  KIND_LABEL,
  SECRET_MASK,
  copyableKeyValue,
  maskedKeyValue,
  scopeSummary,
  statusKind,
  statusLabel,
  visibleKeys,
} from './ApiKeysManager';
import { groupScopesByDomain, scopeAccess } from './ScopeDrawer';
import { ToastProvider } from './Toast';

/**
 * A real sandbox secret key, as the server mints it: the prefix, then 43
 * characters of base64url body. The server publishes `prefix` — the first 8
 * characters of that body — and nothing else; the rest is HMAC'd and gone.
 * Every "no secret on screen" assertion below is measured against TAIL.
 */
const RAW_SECRET = 'bz_test_sk_Ab3xY7QzKp9LmN2vRt5wZc8DhJ4fGs6TbVn1Xy0Qe2U';
const SECRET_PREFIX = 'bz_test_sk_Ab3xY7Qz';
const TAIL = RAW_SECRET.slice(SECRET_PREFIX.length);

const key = (over: Partial<ApiKey> & { id: string; name: string }): ApiKey => ({
  project_id: 'prj_1',
  environment: 'SANDBOX',
  kind: 'SECRET',
  prefix: SECRET_PREFIX,
  public_value: '',
  scopes: ['identity:read'],
  status: 'ACTIVE',
  created_at: '2026-01-01T10:00:00Z',
  last_used_at: null,
  ...over,
});

const ACTIVE_OLD = key({ id: '1', name: 'Servidor antigo', created_at: '2026-01-01T10:00:00Z' });
const ACTIVE_NEW = key({ id: '2', name: 'Servidor novo', created_at: '2026-03-01T10:00:00Z' });
const REVOKED = key({ id: '3', name: 'Chave rodada', status: 'REVOKED', created_at: '2026-02-01T10:00:00Z' });
const PUBLISHABLE = key({
  id: '4',
  name: 'App móvel',
  kind: 'PUBLISHABLE',
  prefix: 'bz_test_pk_Zz11Qq22',
  public_value: 'bz_test_pk_Zz11Qq22RrSsTtUuVvWwXxYy',
  scopes: ['identity:read', 'payment_sessions:write', 'payment_sessions:read'],
});

const renderManager = async (keys: ApiKey[]) => {
  api.listKeys.mockResolvedValue({ keys });
  render(
    <ToastProvider>
      <ApiKeysManager />
    </ToastProvider>,
  );
  // The list loads on mount; every assertion is about the loaded table.
  await screen.findByRole('group', { name: 'Filtrar chaves por estado' });
};

beforeEach(() => {
  vi.clearAllMocks();
  ctx.value = {
    csrf: 'csrf',
    onApiError: (e: unknown) => String(e),
    wsLoad: 'ready',
    wsError: '',
    workspaces: [],
    activeWs: { id: 'ws_1', name: 'WS' },
    selectWorkspace: vi.fn(),
    createWorkspace: vi.fn(),
    reloadWorkspaces: vi.fn(),
    prjLoad: 'ready',
    prjError: '',
    projects: [],
    activeProject: { id: 'prj_1', name: 'Projeto' },
    selectProject: vi.fn(),
    createProject: vi.fn(),
    reloadProjects: vi.fn(),
  };
});
afterEach(cleanup);

// ── which keys the screen shows ──────────────────────────────────────────────
//
// The API answers with every key of the project, ordered oldest-first, and
// rotation leaves the predecessor REVOKED in that answer. So the unfiltered
// list opened on dead credentials, oldest first — the exact inverse of what the
// developer came to see.
describe('the key list — what is shown, and in what order', () => {
  it('opens on the active keys and leaves revoked ones out', async () => {
    await renderManager([ACTIVE_OLD, REVOKED, ACTIVE_NEW]);

    expect(screen.getByText('Servidor novo')).toBeTruthy();
    expect(screen.getByText('Servidor antigo')).toBeTruthy();
    expect(screen.queryByText('Chave rodada')).toBeNull();
  });

  it('shows the revoked keys when they are asked for', async () => {
    await renderManager([ACTIVE_OLD, REVOKED, ACTIVE_NEW]);

    fireEvent.click(screen.getByRole('button', { name: /Revogadas/ }));
    expect(screen.getByText('Chave rodada')).toBeTruthy();
    expect(screen.queryByText('Servidor novo')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Todas/ }));
    expect(screen.getByText('Chave rodada')).toBeTruthy();
    expect(screen.getByText('Servidor novo')).toBeTruthy();
  });

  it('puts active keys above revoked ones, newest first inside each group', async () => {
    await renderManager([ACTIVE_OLD, REVOKED, ACTIVE_NEW]);
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }));

    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent);
    expect(names).toEqual(['Servidor novo', 'Servidor antigo', 'Chave rodada']);
  });

  it('sorts and filters without asking the API for a second list', async () => {
    // Ordering is a presentation concern; it is not worth an API change, and a
    // per-filter refetch would make the counts on the filter disagree with the
    // rows under them.
    await renderManager([ACTIVE_OLD, REVOKED, ACTIVE_NEW]);
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }));
    expect(api.listKeys).toHaveBeenCalledTimes(1);
  });

  it('narrows by name and by prefix', async () => {
    await renderManager([ACTIVE_OLD, ACTIVE_NEW, PUBLISHABLE]);
    const search = screen.getByLabelText('Procurar chaves por nome ou prefixo');

    fireEvent.change(search, { target: { value: 'móvel' } });
    expect(screen.getByText('App móvel')).toBeTruthy();
    expect(screen.queryByText('Servidor novo')).toBeNull();

    fireEvent.change(search, { target: { value: 'bz_test_pk' } });
    expect(screen.getByText('App móvel')).toBeTruthy();
    expect(screen.queryByText('Servidor antigo')).toBeNull();
  });

  it('names the empty result instead of showing an empty table', async () => {
    await renderManager([ACTIVE_NEW]);
    fireEvent.click(screen.getByRole('button', { name: /Revogadas/ }));

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhuma chave revogada neste projeto')).toBeTruthy();
  });

  it('a project with no keys is told so, and pointed at the one action', async () => {
    await api.listKeys.mockResolvedValue({ keys: [] });
    render(
      <ToastProvider>
        <ApiKeysManager />
      </ToastProvider>,
    );

    expect(await screen.findByText('Ainda não há chaves neste projeto')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    // And the empty state carries the create action rather than describing it.
    fireEvent.click(screen.getByRole('button', { name: 'Criar a primeira chave' }));
    expect(screen.getByRole('button', { name: 'Criar chave de teste' })).toBeTruthy();
  });
});

// ── what a row may say about a secret ────────────────────────────────────────
describe('a secret key on screen', () => {
  it('renders the published prefix and a mask — no part of the secret', async () => {
    await renderManager([ACTIVE_NEW]);

    const row = screen.getByText('Servidor novo').closest('tr')!;
    expect(within(row).getByText(`${SECRET_PREFIX}${SECRET_MASK}`)).toBeTruthy();

    // Nothing anywhere in the document — text, attribute or value — reproduces
    // any run of the undisclosed part of the key.
    const html = document.body.innerHTML;
    expect(html).not.toContain(RAW_SECRET);
    for (let i = 0; i + 6 <= TAIL.length; i++) {
      expect(html, `the DOM contains "${TAIL.slice(i, i + 6)}" from the secret`).not.toContain(TAIL.slice(i, i + 6));
    }
  });

  it('offers a copy affordance that copies the identity, not the mask', async () => {
    await renderManager([ACTIVE_NEW, PUBLISHABLE]);

    // The shell delegates [data-copy] to the clipboard, so what a row would
    // copy is exactly this attribute.
    const secretRow = screen.getByText('Servidor novo').closest('tr')!;
    const secretCopy = within(secretRow).getByRole('button', { name: 'Copiar identificador da chave Servidor novo' });
    expect(secretCopy.getAttribute('data-copy')).toBe(SECRET_PREFIX);
    expect(secretCopy.getAttribute('data-copy')).not.toContain('•');

    // A publishable key is non-secret by definition: full value, copied whole.
    const pubRow = screen.getByText('App móvel').closest('tr')!;
    expect(within(pubRow).getByText(PUBLISHABLE.public_value)).toBeTruthy();
    expect(
      within(pubRow).getByRole('button', { name: 'Copiar chave App móvel' }).getAttribute('data-copy'),
    ).toBe(PUBLISHABLE.public_value);
  });

  it('says which kind of key it is, in Portuguese', async () => {
    await renderManager([ACTIVE_NEW, PUBLISHABLE]);
    expect(screen.getByText(KIND_LABEL.SECRET)).toBeTruthy();
    expect(screen.getByText(KIND_LABEL.PUBLISHABLE)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Publishable');
  });

  it('masks to the end of the value, where the unknown part is', () => {
    // The mask stands for what was never returned. Putting visible characters
    // after it would claim to know the end of a key the server hashed away.
    expect(maskedKeyValue(ACTIVE_NEW)).toBe(`${SECRET_PREFIX}${SECRET_MASK}`);
    expect(maskedKeyValue(ACTIVE_NEW).endsWith(SECRET_MASK)).toBe(true);
    expect(maskedKeyValue(PUBLISHABLE)).toBe(PUBLISHABLE.public_value);
    expect(copyableKeyValue(ACTIVE_NEW)).toBe(SECRET_PREFIX);
    // A publishable key whose full value the server did not send falls back to
    // the prefix rather than rendering an empty cell.
    expect(maskedKeyValue({ ...PUBLISHABLE, public_value: '' })).toBe(PUBLISHABLE.prefix);
  });
});

// ── status ──────────────────────────────────────────────────────────────────
describe('the status pill', () => {
  it('names each status it knows', () => {
    expect(statusLabel('ACTIVE')).toBe('Ativa');
    expect(statusLabel('REVOKED')).toBe('Revogada');
    expect(statusKind('ACTIVE')).toBe('success');
    expect(statusKind('REVOKED')).toBe('neutral');
  });

  it('shows an unrecognised status as it is, rather than calling it revoked', () => {
    // The old mapping was `ACTIVE ? 'Ativa' : 'Revogada'`: a key in any third
    // state was reported dead while it still authorized requests.
    expect(statusLabel('SUSPENDED')).toBe('SUSPENDED');
    expect(statusKind('SUSPENDED')).toBe('pending');
  });

  it('does not contradict itself in the actions cell', async () => {
    await renderManager([ACTIVE_NEW, REVOKED]);
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }));

    const revokedRow = screen.getByText('Chave rodada').closest('tr')!;
    expect(within(revokedRow).getByText('Revogada')).toBeTruthy();
    // The row used to say "Revogada" in one cell and "Inativa" in the next.
    expect(revokedRow.textContent).not.toContain('Inativa');
    // And a dead key offers neither of the two actions that need a live one.
    expect(within(revokedRow).queryByRole('button', { name: /Revogar|Rotacionar/ })).toBeNull();
  });
});

// ── scopes ───────────────────────────────────────────────────────────────────
describe('scopes', () => {
  it('summarises in the table instead of printing the token list', async () => {
    await renderManager([PUBLISHABLE]);

    const row = screen.getByText('App móvel').closest('tr')!;
    expect(within(row).getByText('3 permissões')).toBeTruthy();
    expect(within(row).getByText('Identidade · Sessões de pagamento')).toBeTruthy();
    // The raw comma-joined string produced a cell wider than the whole table.
    expect(row.textContent).not.toContain('identity:read, payment_sessions:write');
  });

  it('opens the full list grouped by domain, with what each one grants', async () => {
    await renderManager([PUBLISHABLE]);

    fireEvent.click(screen.getByRole('button', { name: 'Ver as 3 permissões da chave App móvel' }));
    const drawer = screen.getByRole('dialog', { name: 'Permissões da chave App móvel' });

    expect(within(drawer).getByText('Identidade')).toBeTruthy();
    expect(within(drawer).getByText('Sessões de pagamento')).toBeTruthy();
    expect(within(drawer).getByText('payment_sessions:write')).toBeTruthy();
    // The same plain-language text the picker shows when the scope is chosen.
    expect(within(drawer).getByText('Abrir sessões de pagamento — cobrar.')).toBeTruthy();
    // Read and write are not two shades of the same permission.
    expect(within(drawer).getAllByText('Leitura').length).toBe(2);
    expect(within(drawer).getAllByText('Escrita').length).toBe(1);
    expect(drawer.textContent).toContain('nunca autoriza uma alteração');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('counts and groups', () => {
    expect(scopeSummary(['identity:read']).label).toBe('1 permissão');
    expect(scopeSummary([]).count).toBe(0);
    // More domains than fit the cell are counted, not truncated silently.
    expect(scopeSummary(['identity:read', 'refunds:read', 'transfers:write']).domains).toBe(
      'Identidade · Reembolsos +1',
    );
    expect(groupScopesByDomain(['payment_links:write', 'identity:read', 'payment_links:read'])).toEqual([
      { domain: 'payment_links', label: 'Links de pagamento', scopes: ['payment_links:read', 'payment_links:write'] },
      { domain: 'identity', label: 'Identidade', scopes: ['identity:read'] },
    ]);
    expect(scopeAccess('wallet_accounts:create')).toBe('write');
    expect(scopeAccess('wallet_accounts:read')).toBe('read');
  });
});

// ── the two irreversible actions ─────────────────────────────────────────────
describe('rotation and revocation', () => {
  it('states the consequence before doing it, and names the key', async () => {
    await renderManager([ACTIVE_NEW]);

    fireEvent.click(screen.getByRole('button', { name: 'Rotacionar chave Servidor novo' }));
    const dialog = screen.getByRole('dialog', { name: 'Rotacionar chave' });
    expect(dialog.textContent).toContain('o actual deixa de funcionar imediatamente');
    expect(dialog.textContent).toContain('mostrado uma única vez');
    // The dialog names the key by the same masked value the row shows.
    expect(dialog.textContent).toContain(`Servidor novo · ${SECRET_PREFIX}${SECRET_MASK}`);
    expect(api.rotateKey).not.toHaveBeenCalled();
  });

  it('leaves the successor and the predecessor both visible after a rotation', async () => {
    // Rotation makes two rows: a new ACTIVE key and the old one, now REVOKED.
    // The default view hides the second, so without this the developer sees one
    // row replaced by another and no confirmation of which one died.
    api.listKeys
      .mockResolvedValueOnce({ keys: [ACTIVE_OLD] })
      .mockResolvedValue({ keys: [{ ...ACTIVE_OLD, status: 'REVOKED' }, ACTIVE_NEW] });
    api.rotateKey.mockResolvedValue({ ...ACTIVE_NEW, secret: RAW_SECRET });
    render(
      <ToastProvider>
        <ApiKeysManager />
      </ToastProvider>,
    );
    await screen.findByText('Servidor antigo');

    fireEvent.click(screen.getByRole('button', { name: 'Rotacionar chave Servidor antigo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotacionar' }));

    expect(await screen.findByText('Servidor novo')).toBeTruthy();
    const successor = screen.getByText('Servidor novo').closest('tr')!;
    const predecessor = screen.getByText('Servidor antigo').closest('tr')!;
    expect(within(successor).getByText('Ativa')).toBeTruthy();
    expect(within(predecessor).getByText('Revogada')).toBeTruthy();
  });

  it('warns that a revocation cannot be undone', async () => {
    await renderManager([ACTIVE_NEW]);
    fireEvent.click(screen.getByRole('button', { name: 'Revogar chave Servidor novo' }));

    const dialog = screen.getByRole('dialog', { name: 'Revogar chave' });
    expect(dialog.textContent).toContain('não pode ser reactivada');
    expect(dialog.textContent).toContain('401');
  });
});

// ── the pure selection, exercised directly ───────────────────────────────────
describe('visibleKeys', () => {
  const all = [ACTIVE_OLD, REVOKED, ACTIVE_NEW];

  it('defaults to what can still be used', () => {
    expect(visibleKeys(all, 'ACTIVE').map((k) => k.id)).toEqual(['2', '1']);
    expect(visibleKeys(all, 'REVOKED').map((k) => k.id)).toEqual(['3']);
    expect(visibleKeys(all, 'ALL').map((k) => k.id)).toEqual(['2', '1', '3']);
  });

  it('treats any non-active status as revoked for filtering', () => {
    // The filter is a two-way split of a list the server may extend; an unknown
    // status must not vanish from every view.
    const odd = key({ id: '9', name: 'Estranha', status: 'SUSPENDED' });
    expect(visibleKeys([odd], 'ACTIVE')).toEqual([]);
    expect(visibleKeys([odd], 'REVOKED').map((k) => k.id)).toEqual(['9']);
  });

  it('searches case-insensitively over name and prefix', () => {
    expect(visibleKeys(all, 'ALL', 'SERVIDOR').map((k) => k.id)).toEqual(['2', '1']);
    expect(visibleKeys(all, 'ALL', 'nada')).toEqual([]);
  });
});
