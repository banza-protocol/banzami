// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import type { Invite, Member } from '@/lib/developer-api';

const ME = 'usr_11111111-2222-3333-4444-555555555555';
const THEM = 'usr_99999999-8888-7777-6666-555555555555';

const api = {
  listMembers: vi.fn(async () => ({ members: members })),
  listInvites: vi.fn(async () => ({ invites: invites })),
  invite: vi.fn(),
  setRole: vi.fn(),
  removeMember: vi.fn(),
  revokeInvite: vi.fn(async () => ({ ok: true })),
};
let members: Member[] = [];
let invites: Invite[] = [];

vi.mock('@/lib/developer-api', () => ({ developerApi: api }));
vi.mock('./DeveloperAuth', () => ({
  useDeveloperAuth: () => ({ user: { id: ME, email: 'fidel@banzami.com', name: 'Fidel Monteiro' } }),
}));
// One object, not a fresh one per render. The real provider memoises everything
// it hands out (onApiError is a useCallback), and a mock that did not would make
// every load callback a new identity on every render — the effect that loads the
// list would then re-fire forever, which is a property of the mock and not of
// the component.
const data = {
  activeWs: { id: 'ws_a', name: 'A minha empresa', slug: 'a', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z' },
  wsLoad: 'ready',
  csrf: 'csrf',
  onApiError: () => 'Serviço indisponível. Tente novamente.',
};
vi.mock('./DeveloperData', () => ({ useDeveloperData: () => data }));
vi.mock('./Toast', () => ({ useToast: () => ({ flash: vi.fn() }), copyText: vi.fn() }));

const { MembersManager } = await import('./MembersManager');

beforeEach(() => {
  members = [
    { user_id: ME, role: 'OWNER', status: 'ACTIVE', name: 'Fidel Monteiro', email: 'fidel@banzami.com' },
    { user_id: THEM, role: 'DEVELOPER', status: 'ACTIVE', name: 'Ana Cardoso', email: 'ana@banzami.com' },
  ];
  invites = [];
  api.listInvites.mockClear();
  api.revokeInvite.mockClear();
});
afterEach(cleanup);

async function show() {
  render(<MembersManager />);
  await waitFor(() => expect(screen.queryByText('A carregar membros…')).toBeNull());
}

const dialog = () => screen.getByRole('dialog');

describe('the roles, in the language the Console speaks', () => {
  it('names every role in Portuguese', async () => {
    members = [
      { user_id: ME, role: 'OWNER', status: 'ACTIVE' },
      { user_id: THEM, role: 'ADMIN', status: 'ACTIVE' },
      { user_id: 'usr_c', role: 'DEVELOPER', status: 'ACTIVE' },
      { user_id: 'usr_d', role: 'FINANCE', status: 'ACTIVE' },
      { user_id: 'usr_e', role: 'VIEWER', status: 'ACTIVE' },
    ];
    await show();
    const body = document.body.textContent ?? '';
    for (const pt of ['Proprietário', 'Administrador', 'Programador', 'Financeiro', 'Observador']) {
      expect(body, `missing ${pt}`).toContain(pt);
    }
    // The English vocabulary is the wire's, not the reader's. Matched on word
    // boundaries: "Administrador" legitimately starts with "Admin".
    for (const en of ['Owner', 'Admin', 'Developer', 'Finance', 'Viewer']) {
      expect(body, `renders the wire word ${en}`).not.toMatch(new RegExp(`\\b${en}\\b`));
    }
  });

  // A role added to the server after this bundle shipped used to fall straight
  // through to the UI as an uppercase wire code.
  it('does not leak a raw code for a role it does not know', async () => {
    members = [
      { user_id: ME, role: 'OWNER', status: 'ACTIVE' },
      { user_id: THEM, role: 'OWNER_DELEGATE', status: 'ACTIVE' },
    ];
    await show();
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('OWNER_DELEGATE');
    expect(body).toContain('Papel desconhecido');
    // Still traceable for a support conversation, just not in the sentence.
    expect(screen.getByTitle('OWNER_DELEGATE')).toBeTruthy();
  });

  it('does not leak a raw status code either', async () => {
    members = [{ user_id: ME, role: 'OWNER', status: 'SUSPENDED' }];
    await show();
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('SUSPENDED');
    expect(body).toContain('Estado desconhecido');
  });

  it('tells a non-manager who may invite, without switching language mid-sentence', async () => {
    members = [{ user_id: ME, role: 'VIEWER', status: 'ACTIVE' }];
    await show();
    expect(document.body.textContent).toContain('Só um Proprietário ou Administrador pode convidar ou gerir membros.');
  });
});

describe('who the reader is looking at', () => {
  it('marks the reader with the identity the session actually knows', async () => {
    await show();
    expect(screen.getByText('Fidel Monteiro')).toBeTruthy();
    expect(screen.getByText('VOCÊ')).toBeTruthy();
  });

  // The list now carries the member's own sign-in identity, so a row says who it
  // is about instead of showing twelve characters of a UUID to somebody deciding
  // whether to remove them.
  it('names a teammate the server named, with initials from that name', async () => {
    await show();
    expect(screen.getByText('Ana Cardoso')).toBeTruthy();
    expect(screen.getByTestId(`member-avatar-${THEM}`).textContent).toBe('AC');
    // The id is still offered as an id — copyable, and complete on the control.
    expect(screen.getByLabelText(`Copiar o ID de utilizador ${THEM}`)).toBeTruthy();
  });

  // `name` is often empty: an account that never set one. The email is the
  // identity then — and only the identity. Initials cut out of an email address
  // look exactly like somebody's initials and are a guess, which is why that
  // guess was removed from this Console elsewhere.
  it('shows the email when there is no name, and invents no initials from it', async () => {
    members = [
      { user_id: ME, role: 'OWNER', status: 'ACTIVE', name: 'Fidel Monteiro', email: 'fidel@banzami.com' },
      { user_id: THEM, role: 'DEVELOPER', status: 'ACTIVE', name: '', email: 'ana.cardoso@empresa.co.ao' },
    ];
    await show();
    expect(screen.getByText('ana.cardoso@empresa.co.ao')).toBeTruthy();

    const avatar = screen.getByTestId(`member-avatar-${THEM}`);
    // Not "A", not "AC", not "AE": no letters at all, just the glyph.
    expect(avatar.textContent, 'initials were assembled out of an email').toBe('');
    expect(avatar.querySelector('svg')).toBeTruthy();
  });

  // Both fields empty is the server declining to answer for that identity row —
  // deliberate, and not an error. The row still must not become a person.
  it('falls back to words when the identity could not be read', async () => {
    members = [
      { user_id: ME, role: 'OWNER', status: 'ACTIVE', name: 'Fidel Monteiro', email: 'fidel@banzami.com' },
      { user_id: THEM, role: 'DEVELOPER', status: 'ACTIVE', name: '', email: '' },
    ];
    await show();
    expect(screen.getByText('Membro da equipa')).toBeTruthy();
    expect(screen.getByTestId(`member-avatar-${THEM}`).textContent).toBe('');
  });

  it('no longer says the platform cannot name the other members', async () => {
    await show();
    expect(document.body.textContent).not.toMatch(/ainda não devolve o nome nem o email/);
  });
});

describe('the invites the workspace has out', () => {
  const pending: Invite = {
    id: 'inv_1',
    email: 'novo@empresa.co.ao',
    role: 'DEVELOPER',
    expires_at: '2026-09-19T08:30:00Z',
    created_at: '2026-09-12T08:30:00Z',
  };

  it('lists the pending invites, with when each one expires', async () => {
    invites = [pending];
    await show();
    expect(api.listInvites).toHaveBeenCalledWith('ws_a');
    expect(screen.getByText('novo@empresa.co.ao')).toBeTruthy();
    // The same UTC rendering the rest of the Console uses for a server timestamp.
    expect(document.body.textContent).toContain('2026-09-19 08:30:00Z');
  });

  it('says so when there are none, instead of showing nothing', async () => {
    invites = [];
    await show();
    expect(screen.getByText('Não há convites pendentes neste workspace.')).toBeTruthy();
  });

  it('does not revoke on the click that asks to revoke', async () => {
    invites = [pending];
    await show();
    fireEvent.click(screen.getByLabelText('Revogar o convite de novo@empresa.co.ao'));

    // Nothing has happened yet: what appeared is a question naming the address,
    // because "Revogar convite" alone cannot say which one.
    expect(api.revokeInvite).not.toHaveBeenCalled();
    expect(within(dialog()).getByText(/novo@empresa\.co\.ao/)).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(api.revokeInvite).toHaveBeenCalledWith('ws_a', 'inv_1', 'csrf'));
    // And the list is re-read, so a revoked invite cannot linger on screen.
    await waitFor(() => expect(api.listInvites).toHaveBeenCalledTimes(2));
  });

  it('does not ask a non-manager for a list the server would refuse', async () => {
    members = [{ user_id: ME, role: 'VIEWER', status: 'ACTIVE', name: 'Fidel Monteiro', email: 'fidel@banzami.com' }];
    await show();
    expect(api.listInvites).not.toHaveBeenCalled();
  });
});
