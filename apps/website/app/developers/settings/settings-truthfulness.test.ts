/**
 * The Settings page must not invent the project it is describing.
 *
 * It used to render a project called "Minha Loja Online" with the id
 * "prj_51HKZQ8BZM9F" — neither of which existed — beside an Editar button with
 * no handler, a copy button that copied the invented id, and a green toggle
 * asserting that OTP reauthentication guarded critical actions.
 *
 * The toggle is why this test exists rather than a tidy-up commit. A wrong
 * project name is embarrassing. A security control displayed as ON when nothing
 * implements it is a claim a developer would rely on, and there is no OTP gate
 * on key reveal or rotation anywhere in this Console.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'app/developers/settings/page.tsx'), 'utf8');
// Comments name what was removed, which is the opposite of rendering it.
const CODE = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('Console settings', () => {
  it('renders no invented project identity', () => {
    expect(CODE).not.toMatch(/Minha Loja Online/);
    expect(CODE).not.toMatch(/prj_[A-Z0-9]{8,}/);
  });

  it('reads the project from the platform instead', () => {
    expect(CODE).toMatch(/useDeveloperData\(\)/);
    expect(CODE).toMatch(/activeProject\.id/);
    expect(CODE).toMatch(/activeProject\.name/);
  });

  it('claims no OTP reauthentication, because none is implemented', () => {
    expect(CODE).not.toMatch(/Reautenticação OTP/i);
  });

  it('offers no button without a handler', () => {
    // Every <button> in the file must carry an onClick. The only one left is
    // the copy control, which has one.
    const buttons = CODE.match(/<button[\s\S]*?>/g) ?? [];
    for (const b of buttons) expect(b).toMatch(/onClick=/);
  });

  it('says where the actions it does not have actually live', () => {
    expect(CODE).toMatch(/\/api-keys/);
    expect(CODE).toMatch(/developers@banzami\.com/);
  });
});
