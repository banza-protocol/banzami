/**
 * The Go Live page must not describe an application that was never made.
 *
 * It used to show a KYB checklist — company information "Concluído", legal
 * documents "Concluído", beneficial owners "Concluído", KYB verification
 * "Pendente", final review "Em análise" — beside a "Solicitar revisão" button
 * with no handler. Nothing had been submitted and no queue existed. A developer
 * reading it would have believed their Live application was most of the way
 * through review.
 *
 * Financial Live is not built. The page says so, and this keeps it saying so:
 * the moment a real onboarding flow exists, these assertions should be replaced
 * by ones about that flow, not deleted to make room for a mock of it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'app/developers/go-live/page.tsx'), 'utf8');
const CODE = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('Go Live', () => {
  it('shows no fabricated onboarding progress', () => {
    expect(CODE).not.toMatch(/Concluído/);
    expect(CODE).not.toMatch(/Em análise/);
    expect(CODE).not.toMatch(/Solicitar revisão/);
  });

  it('states plainly that Live is unavailable', () => {
    expect(CODE).toMatch(/ainda não está disponível/i);
  });

  it('says nothing in the Console can enable it', () => {
    expect(CODE).toMatch(/nenhum botão/i);
    expect(CODE).toMatch(/bz_live_/);
  });

  it('offers no control that does nothing', () => {
    const buttons = CODE.match(/<button[\s\S]*?>/g) ?? [];
    for (const b of buttons) expect(b).toMatch(/onClick=/);
  });
});
