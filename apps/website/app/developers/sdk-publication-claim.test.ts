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

const src = readFileSync(join(process.cwd(), 'app/developers/page.tsx'), 'utf8');

describe('SDK publication claims on the developer landing', () => {
  it('renders the proven published packages, and only those', () => {
    expect(src).toContain('PUBLISHED_PACKAGES.map');
    expect(PUBLISHED_PACKAGES.map((p) => p.name)).toContain('@banzami/sdk');
  });

  it('names no package, install command or publication state of its own', () => {
    expect(src).not.toMatch(/npm install|pip install|composer require|go get|dart pub add/);
    expect(src).not.toMatch(/não publicad|unpublished|ainda não/i);
    for (const cmd of FAKE_INSTALL_COMMANDS) expect(src.includes(cmd)).toBe(false);
  });
});
