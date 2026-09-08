/**
 * The enrolment screens must be usable without a mouse, a camera, or sight.
 *
 * Every step here is a security control: an operator who cannot read the QR, or
 * cannot tell that a code was rejected, does not fall back to something less
 * safe — they fall back to asking somebody else to do it for them.
 *
 * Source-level, like the Console's other truthfulness checks: what is asserted
 * is what the page always renders, not what one render produced.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// BANZADMIN has no test toolchain of its own; this suite already reads other
// packages' sources in CI (see api-key-scopes.test.ts), so the check lives where
// it actually runs rather than where it would merely look tidy.
const SRC = readFileSync(join(process.cwd(), '../..', 'apps/admin/app/login/page.tsx'), 'utf8');

describe('BANZADMIN MFA enrolment — accessibility', () => {
  it('gives the QR a text alternative that names the way in without a camera', () => {
    expect(SRC).toMatch(/role="img"/);
    const label = SRC.match(/aria-label="([^"]*Código QR[^"]*)"/)?.[1] ?? '';
    expect(label.length).toBeGreaterThan(30);
    // The alternative must not merely say "QR code" — it has to point at the
    // manual key, which is the only path for someone who cannot scan.
    expect(label).toMatch(/manual/i);
  });

  it('keeps the manual key reachable, and hidden until asked for', () => {
    expect(SRC).toContain('Introduzir a chave manualmente');
    // A real button, so it is in the tab order — not a div with onClick.
    expect(SRC).toMatch(/<button[^>]*onClick=\{\(\) => setShowSecret\(true\)\}/s);
    expect(SRC).toContain('showSecret ?');
  });

  it('labels the code field and associates its help and its error', () => {
    expect(SRC).toMatch(/htmlFor="mfa-code"/);
    expect(SRC).toMatch(/id="mfa-code"/);
    expect(SRC).toMatch(/aria-describedby=\{error \? 'mfa-code-error' : 'mfa-code-help'\}/);
    expect(SRC).toMatch(/id="mfa-code-help"/);
    expect(SRC).toMatch(/id="mfa-code-error"/);
    expect(SRC).toMatch(/aria-invalid/);
  });

  it('announces a rejected code instead of only colouring it', () => {
    // role="alert" is what makes a screen reader speak the refusal; without it
    // the only signal that a code failed is red text.
    expect((SRC.match(/role="alert"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('gives the copy and save controls accessible names', () => {
    expect(SRC).toMatch(/aria-label="Copiar os códigos de recuperação"/);
    expect(SRC).toMatch(/aria-label="Descarregar os códigos de recuperação"/);
    // "Copiados" must be announced, not just repainted.
    expect(SRC).toMatch(/aria-live="polite"/);
  });

  it('presents the recovery codes as a list a screen reader can walk', () => {
    expect(SRC).toMatch(/<ul\b/);
    expect(SRC).toMatch(/recovery\.map\(\(c\) => <li key=\{c\}>\{c\}<\/li>\)/);
    expect(SRC).toMatch(/aria-label=\{`\$\{recovery\.length\} códigos de recuperação/);
  });

  it('makes the acknowledgement a real labelled checkbox', () => {
    // Wrapped in <label>, so the text is the accessible name and clicking it
    // toggles — and it is in the tab order as a checkbox, not a styled div.
    expect(SRC).toMatch(/<label[^>]*>\s*<input\s+type="checkbox"/s);
    expect(SRC).toContain('Guardei os códigos de recuperação num local seguro.');
  });

  it('moves focus to the recovery screen when it appears', () => {
    expect(SRC).toMatch(/tabIndex=\{-1\}[^>]*autoFocus|autoFocus[^>]*tabIndex=\{-1\}/s);
  });

  it('never renders the seed as the primary enrolment path', () => {
    const qrAt = SRC.indexOf('Leia este código com o seu autenticador');
    const keyAt = SRC.indexOf('Introduzir a chave manualmente');
    expect(qrAt).toBeGreaterThan(-1);
    expect(keyAt).toBeGreaterThan(qrAt);
  });
});
