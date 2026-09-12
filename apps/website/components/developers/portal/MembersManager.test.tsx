// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { Member } from '@/lib/developer-api';

const ME = 'usr_11111111-2222-3333-4444-555555555555';
const THEM = 'usr_99999999-8888-7777-6666-555555555555';

const api = {
  listMembers: vi.fn(async () => ({ members: members })),
  invite: vi.fn(),
  setRole: vi.fn(),
  removeMember: vi.fn(),
  revokeInvite: vi.fn(),
};
let members: Member[] = [];

vi.mock('@/lib/developer-api', () => ({ developerApi: api }));
vi.mock('./DeveloperAuth', () => ({
  useDeveloperAuth: () => ({ user: { id: ME, email: 'fidel@banzami.com', name: 'Fidel Monteiro' } }),
}));
vi.mock('./DeveloperData', () => ({
  useDeveloperData: () => ({
    activeWs: { id: 'ws_a', name: 'A minha empresa', slug: 'a', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z' },
    wsLoad: 'ready',
    csrf: 'csrf',
    onApiError: () => 'Serviço indisponível. Tente novamente.',
  }),
}));
vi.mock('./Toast', () => ({ useToast: () => ({ flash: vi.fn() }), copyText: vi.fn() }));

const { MembersManager } = await import('./MembersManager');

beforeEach(() => {
  members = [
    { user_id: ME, role: 'OWNER', status: 'ACTIVE' },
    { user_id: THEM, role: 'DEVELOPER', status: 'ACTIVE' },
  ];
});
afterEach(cleanup);

async function show() {
  render(<MembersManager />);
  await waitFor(() => expect(screen.queryByText('A carregar membros…')).toBeNull());
}

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

  // The platform returns {user_id, role, status} and nothing else. A truncated
  // UUID rendered as a person's name, with its first two characters presented
  // as initials, was an invented identity.
  it('does not dress a teammate up as a person it cannot name', async () => {
    await show();
    expect(document.body.textContent).toContain('Membro da equipa');
    // The id is offered as an id — copyable, and complete on the control.
    expect(screen.getByLabelText(`Copiar o ID de utilizador ${THEM}`)).toBeTruthy();
  });

  it('says why the other rows have no name', async () => {
    await show();
    expect(document.body.textContent).toMatch(/ainda não devolve o nome nem o email dos outros membros/);
  });
});
