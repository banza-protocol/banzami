/**
 * A Project gets a Business inside the Console, and only in the two ways the
 * product allows.
 *
 * "One Business identity. Multiple onboarding surfaces. One KYB authority." The
 * Console must not send a developer to the public Business application to
 * onboard a Project (the Project would never be bound to what that creates),
 * and nothing may reach the retired one-click setup — POST
 * /projects/{id}/financial-setup, which created a synthetic Business and wrote
 * its KYB as approved with nobody reviewing anything. The server answers it 410
 * FINANCIAL_SETUP_BY_REVIEW; this guard keeps the client from calling it again.
 *
 * Node-only (fs), no jsdom, no network. Each predicate is shown to fire on the
 * code it exists to catch, below — a guard never observed failing is decoration.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** Source without comment lines: comments may name what is retired. */
const code = (src: string) =>
  src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('{/*'))
    .join('\n');

function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

/** Everything the Console ships: its pages, its components, its API client. */
const CONSOLE_SOURCES = [
  ...sources(join(ROOT, 'app/developers')),
  ...sources(join(ROOT, 'components/developers')),
  join(ROOT, 'lib/developer-api.ts'),
  join(ROOT, 'lib/financial-onboarding.ts'),
];

const predicates = {
  /** A link (or navigation) to the public Business application. */
  linksToPublicApplication: (src: string) => /comerciantes\/candidatura/.test(src),
  /** A client for, or a call to, the retired one-click setup. */
  callsRetiredSetup: (src: string) =>
    /configureFinancialSetup/.test(src) ||
    /financial-setup[`'"]\s*,\s*\{[^}]*method:\s*['"]POST['"]/.test(src),
};

describe('Console financial onboarding', () => {
  it('never sends a developer to the public Business application', () => {
    const offenders = CONSOLE_SOURCES.filter((f) => predicates.linksToPublicApplication(code(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => f.replace(ROOT + '/', ''))).toEqual([]);
  });

  it('nothing calls the retired one-click financial setup', () => {
    const offenders = CONSOLE_SOURCES.filter((f) => predicates.callsRetiredSetup(code(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => f.replace(ROOT + '/', ''))).toEqual([]);
  });

  it('the Console still reads the financial setup, and offers both onboarding paths', () => {
    const client = code(readFileSync(join(ROOT, 'lib/developer-api.ts'), 'utf8'));
    expect(client).toMatch(/financialSetup: \(projectID: string\) =>/);
    expect(client).toContain('/financial-onboarding/applications');
    expect(client).toContain('/financial-onboarding/link');
  });
});

describe('the guard predicates fire on what they exist to catch', () => {
  it.each([
    ['linksToPublicApplication', '<Link href="https://banzami.com/comerciantes/candidatura">Candidatar</Link>'],
    ['linksToPublicApplication', "router.push('/comerciantes/candidatura')"],
    ['callsRetiredSetup', "configureFinancialSetup: (projectID: string, csrf: string) => req(`/projects/${projectID}/financial-setup`, { method: 'POST', csrf }),"],
    ['callsRetiredSetup', "req(`/projects/${projectID}/financial-setup`, { method: 'POST', csrf })"],
    ['callsRetiredSetup', 'await developerApi.configureFinancialSetup(activeProject.id, csrf);'],
  ] as const)('%s catches: %s', (name, snippet) => {
    expect(predicates[name](snippet)).toBe(true);
  });

  it('does not fire on the read that stays', () => {
    expect(predicates.callsRetiredSetup('financialSetup: (projectID: string) => req(`/projects/${projectID}/financial-setup`),')).toBe(false);
  });
});
