/**
 * The portal must not tell a developer that a published SDK is unpublished.
 *
 * `@banzami/sdk` sat on npm while this page said "ainda não publicado em npm",
 * next to docs that told the reader to run `npm install @banzami/sdk`. The two
 * statements contradicted each other on the same site, and the wrong one was
 * the more prominent.
 *
 * The claim about the OTHER SDKs is currently true — flutter and PHP really are
 * source-only — so this pins the specific claim rather than banning the phrase,
 * and will need updating when they publish. That is the point: the day one of
 * them ships, this test is the reminder.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(process.cwd(), 'app/developers/page.tsx'), 'utf8');

describe('SDK publication claims', () => {
  it('does not claim @banzami/sdk is unpublished', () => {
    expect(src).not.toMatch(/@banzami\/sdk[^']*não publicado/);
  });

  it('shows the real install command for it', () => {
    expect(src).toContain('npm install @banzami/sdk');
  });

  it('does not tell developers the SDKs are unpublished anywhere on the page', () => {
    // A second copy of the same false claim sat above a curl snippet, steering
    // readers to hand-rolled HTTP "because the SDKs aren't published". That
    // contradicts both the registry and the SDK-first policy, and it is the more
    // damaging of the two: it does not just misinform, it recommends the wrong
    // integration.
    expect(src).not.toMatch(/SDKs? ainda não est[ãa]o? publicad/);
  });

  it('still says so for the SDKs that genuinely are source-only', () => {
    // Guards the opposite error: a blanket find-and-replace that would claim
    // registries hold packages they do not.
    //
    // This used to name banzami_flutter, which is now absent entirely — it is
    // Banzami's own application framework, deliberately never published
    // (ADR-053) — and then banzami_client, which has since been published. What
    // remains genuinely source-only is the PHP package.
    expect(src).toMatch(/banzami\/sdk — ainda não publicado em Packagist/);
  });
});
