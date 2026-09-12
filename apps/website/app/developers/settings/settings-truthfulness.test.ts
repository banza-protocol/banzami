/**
 * The Settings pages must not invent what they describe, and must not describe
 * two different things as one.
 *
 * The first half of this file is the original test. Settings used to render a
 * project called "Minha Loja Online" with the id "prj_51HKZQ8BZM9F" — neither of
 * which existed — beside an Editar button with no handler, a copy button that
 * copied the invented id, and a green toggle asserting that OTP
 * reauthentication guarded critical actions. The toggle is why this was a test
 * and not a tidy-up commit: a wrong project name is embarrassing, and a security
 * control displayed as ON when nothing implements it is a claim a developer
 * would rely on.
 *
 * The second half is the defect that replaced it. Once the invented project was
 * gone the page was honest and still wrong in structure: it described ONE
 * PROJECT, and folded a WORKSPACE-scoped member list into the middle of itself.
 * Pressing Remover there removed the person from every project in the workspace,
 * under a heading that said the name of one of them. The two surfaces are now
 * two pages, and these tests keep them apart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
// Comments name what was removed, which is the opposite of rendering it.
const code = (p: string) =>
  read(p)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('{/*'))
    .join('\n');

const PROJECT_PAGE = 'app/developers/settings/page.tsx';
const WORKSPACE_PAGE = 'app/developers/settings/workspace/page.tsx';
const SHARED = 'app/developers/settings/settings-ui.tsx';
const DANGER = 'components/developers/portal/DangerZone.tsx';

const ALL = [PROJECT_PAGE, WORKSPACE_PAGE, SHARED, DANGER];

describe('Console settings', () => {
  it('renders no invented project identity', () => {
    for (const p of ALL) {
      expect(code(p), p).not.toMatch(/Minha Loja Online/);
      expect(code(p), p).not.toMatch(/prj_[A-Z0-9]{8,}/);
    }
  });

  it('reads the project from the platform instead', () => {
    const CODE = code(PROJECT_PAGE);
    expect(CODE).toMatch(/useDeveloperData\(\)/);
    expect(CODE).toMatch(/activeProject\.id/);
    expect(CODE).toMatch(/activeProject\.name/);
  });

  it('claims no OTP reauthentication, because none is implemented', () => {
    for (const p of ALL) expect(code(p), p).not.toMatch(/Reautenticação OTP/i);
  });

  it('offers no button without a handler', () => {
    for (const p of ALL) {
      const buttons = code(p).match(/<button[\s\S]*?>/g) ?? [];
      for (const b of buttons) expect(b, p).toMatch(/onClick=/);
    }
  });

  it('says where the actions it does not have actually live', () => {
    const CODE = code(PROJECT_PAGE);
    expect(CODE).toMatch(/\/api-keys/);
    expect(CODE).toMatch(/developers@banzami\.com/);
  });
});

describe('the two surfaces are two surfaces', () => {
  it('keeps the workspace member list off the project page', () => {
    expect(code(PROJECT_PAGE)).not.toMatch(/MembersManager/);
    expect(code(WORKSPACE_PAGE)).toMatch(/MembersManager/);
  });

  it('gives each page the lifecycle actions that belong to it', () => {
    const project = code(PROJECT_PAGE);
    expect(project).toMatch(/archiveProject/);
    expect(project).toMatch(/deleteProject/);
    expect(project).toMatch(/renameProject/);
    // Nothing on the project page may close or leave the workspace.
    expect(project).not.toMatch(/archiveWorkspace|leaveWorkspace|renameWorkspace/);

    const workspace = code(WORKSPACE_PAGE);
    expect(workspace).toMatch(/renameWorkspace/);
    expect(workspace).toMatch(/archiveWorkspace/);
    expect(workspace).toMatch(/leaveWorkspace/);
    expect(workspace).not.toMatch(/archiveProject|deleteProject/);
  });

  // This used to assert archive-ONLY, on the reasoning that audit events are
  // append-only and a workspace's projects may hold financial history. The
  // second half is a real constraint; the first is not. developer.audit_events
  // has no foreign key to a workspace, so the record of a deletion outlives the
  // row it describes — an append-only log owes the RECORD, not an empty
  // workspace kept selectable for ever.
  //
  // So a workspace follows the rule its projects already followed: never held a
  // project → delete; held one → archive. Both endings must exist in the page,
  // and it must decide between them from what the workspace HOLDS rather than
  // offering one unconditionally.
  it('offers the ending that matches what the workspace holds', () => {
    const workspace = code(WORKSPACE_PAGE);
    expect(workspace).toMatch(/Arquivar workspace/);
    expect(workspace).toMatch(/Eliminar workspace/);
    // Decided from the footprint, not hard-coded.
    expect(workspace).toMatch(/useWorkspaceFootprint/);
    expect(workspace).toMatch(/deletable/);
  });

  it('asks what the workspace holds BEFORE offering either ending', () => {
    const workspace = code(WORKSPACE_PAGE);
    expect(workspace).toMatch(/useWorkspaceFootprint/);
    expect(workspace).toMatch(/workspaceFootprintSentence/);
  });

  // The two calls are different verbs on different paths, exactly as the
  // project's are: DELETE ends an empty one, POST /archive retires one with a
  // history. One endpoint doing both by guessing would be the "two semantics"
  // this codebase refuses.
  it('deleting and archiving a workspace are two distinct calls', () => {
    const api = read('lib/developer-api.ts');
    expect(api).toMatch(/deleteWorkspace:[\s\S]*?method: 'DELETE'/);
    expect(api).toMatch(/archiveWorkspace:[\s\S]*?\/archive`, \{ method: 'POST'/);
  });

  it('routes every destructive action through the type-the-name gate', () => {
    for (const p of [PROJECT_PAGE, WORKSPACE_PAGE]) {
      expect(code(p), p).toMatch(/ConfirmByName/);
    }
  });

  it('asks what the project holds BEFORE offering to delete it', () => {
    const project = code(PROJECT_PAGE);
    expect(project).toMatch(/useProjectFootprint/);
    expect(project).toMatch(/footprintSentence/);
  });
});

describe('the environment is read, not painted in', () => {
  // The word "Sandbox" was hard-coded in this page, in the sidebar, in the top
  // bar, in the banner and in the project selector's own label. Here it now
  // comes from a reading — and the ONLY literal occurrences left in this tree
  // are inside that reading's own mapping.
  it('states no environment as a literal in either page', () => {
    for (const p of [PROJECT_PAGE, WORKSPACE_PAGE]) {
      expect(code(p), p).not.toMatch(/Sandbox/);
    }
  });

  it('derives it from the platform', () => {
    expect(code(PROJECT_PAGE)).toMatch(/useProjectEnvironment/);
    expect(code(SHARED)).toMatch(/developerApi\.financialSetup/);
  });
});
