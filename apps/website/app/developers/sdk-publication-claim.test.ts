/**
 * The developer landing page names only packages a registry really serves.
 *
 * It once said "@banzami/sdk — ainda não publicado em npm" while the package sat
 * on npm, and later listed Python, PHP and Go SDKs that no registry had. Since
 * PUBLIC-TRUTH-001 the page renders PUBLISHED_PACKAGES — the list a clean-room
 * registry install proves — and names no package itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAKE_INSTALL_COMMANDS, PUBLISHED_PACKAGES } from './docs/published-packages';

// The landing content lives in the marketing component the route renders.
const src = readFileSync(join(process.cwd(), 'components/marketing/pages/Developers.tsx'), 'utf8');

describe('SDK publication claims on the developer landing', () => {
  it('renders the proven published packages, and only those', () => {
    expect(src).toContain('PUBLISHED_PACKAGES.map');
    expect(PUBLISHED_PACKAGES.map((p) => p.name)).toContain('@banzami/sdk');
  });

  it('hardcodes no install command of its own, and no fake command', () => {
    // Install commands are rendered from PUBLISHED_PACKAGES (see the first test),
    // never written as literals here, so the landing cannot drift from what a
    // clean-room registry install proves. The frozen design does show a
    // publication-status column, driven by the same source of truth.
    expect(src).not.toMatch(/npm install|pip install|composer require|go get|dart pub add/);
    for (const cmd of FAKE_INSTALL_COMMANDS) expect(src.includes(cmd)).toBe(false);
  });
});
