/**
 * The controlled-preview programme is retired, and must stay retired.
 *
 * This replaces p2d-sdk-preview-onboarding.test.ts and p2e-trust-readiness.test.ts,
 * which asserted that the preview programme WAS documented — its onboarding
 * journey, its eligibility step, its approved partners, its readiness review,
 * its seven partner-readiness artifacts. Those tests were doing their job: they
 * pinned the documentation of the day. The day passed.
 *
 * @banzami/sdk is on npm and banzami_client is on pub.dev. Anyone can install
 * either without an invitation, an approval or a conversation. Documentation
 * describing a programme you must be admitted to therefore describes a product
 * that does not exist, and the reader it misleads is exactly the reader the
 * documentation is for: someone deciding whether they can start today.
 *
 * So the guard is inverted. Node-only (fs + JSON), no jsdom, no network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAKE_INSTALL_COMMANDS, PUBLISHED_PACKAGES } from './published-packages';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

/**
 * Comments are stripped before matching. An anchor id kept for link stability
 * carries a comment explaining that the section is NOT a preview, and matching
 * the explanation would fail the guard for saying the right thing.
 */
const prose = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const PT = prose(read('apps/website/app/developers/docs/content-pt.tsx'));
const EN = prose(read('apps/website/app/developers/docs/content-en.tsx'));
const SHELL = prose(read('apps/website/app/developers/docs/shell.tsx'));
const ALL = `${PT}\n${EN}\n${SHELL}`;

/** Phrases that only make sense while the SDK is behind an approval. */
const PREVIEW_FRAMING: [RegExp, string][] = [
  [/preview SDK/i, 'there is no SDK preview to be admitted to — the packages are on public registries'],
  [/SDK preview/i, 'there is no SDK preview to be admitted to — the packages are on public registries'],
  [/onboarding do preview/i, 'the preview onboarding programme is retired'],
  [/parceiros? aprovados?/i, 'there are no approved partners; there is npm'],
  [/approved partners?/i, 'there are no approved partners; there is npm'],
  [/acesso controlado/i, 'access to the SDK is not controlled'],
  [/controlled access/i, 'access to the SDK is not controlled'],
  [/registo p[úu]blico self-service/i, 'the registries ARE public self-service; this sentence denied it'],
  [/self-service public registry/i, 'the registries ARE public self-service; this sentence denied it'],
];

describe('the controlled-preview programme is gone', () => {
  it.each(PREVIEW_FRAMING)('%s is absent from the documentation', (re, why) => {
    const hit = re.exec(ALL);
    expect(hit === null, hit ? `found ${JSON.stringify(hit[0])} — ${why}` : '').toBe(true);
  });

  it('no page claims that packages are not published in public registries', () => {
    for (const re of [
      /não publica pacotes em registries públicos/i,
      /does not publish packages to public registries/i,
      /prova de publicação pública dos pacotes/i,
      /proof of public package publication/i,
    ]) {
      expect(re.test(ALL), `still claims nothing is published: ${re}`).toBe(false);
    }
  });
});

describe('what replaced it says the true thing', () => {
  it('every published package carries its real registry install command', () => {
    for (const p of PUBLISHED_PACKAGES) {
      expect(PT.includes(p.install), `PT is missing "${p.install}"`).toBe(true);
      expect(EN.includes(p.install), `EN is missing "${p.install}"`).toBe(true);
    }
  });

  it('no install command exists for a package no registry has', () => {
    for (const cmd of FAKE_INSTALL_COMMANDS) {
      expect(ALL.includes(cmd), `documentation tells a reader to run "${cmd}"`).toBe(false);
    }
  });

  it('the checklist survived the programme, as a checklist and not an approval', () => {
    // The Sandbox validation list was the one genuinely useful part of the
    // preview journey; it is kept, without the gate in front of it.
    expect(PT).toContain('Antes de pôr a integração a sério');
    expect(PT).toContain('Idempotency-Key');
    expect(PT).toMatch(/não há convite/i);
  });

  it('the security guide replaced the readiness package', () => {
    for (const t of ['A chave secreta é do servidor', 'Revelada uma vez', 'Rotação e revogação', 'O segredo do webhook']) {
      expect(PT.includes(t), `PT security guide is missing: ${t}`).toBe(true);
    }
    // And it still refuses to overclaim in the direction that matters.
    expect(PT).toMatch(/Não existe ambiente financeiro Live/i);
  });

  it('support guidance never asks for a secret', () => {
    expect(PT).toMatch(/Nunca envie uma chave de API/i);
    expect(PT).toContain('request_id');
  });
});
