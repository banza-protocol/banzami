// The Developer portal is served from developers.banzami.com, but several
// pages it wants to link to — company, legal, product — only exist on
// banzami.com. A relative href to one of those renders a link that 404s for
// every developer who clicks it, and the first place that happened was the
// Terms of Service and Privacy Policy on the sign-in page: the consent a
// developer is asked to agree to, pointing at nothing.
//
// Node-only (fs), no jsdom, no network.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DEV = join(process.cwd(), 'app/developers');

/**
 * Routes that exist on banzami.com but NOT on developers.banzami.com, verified
 * against both hosts rather than assumed:
 *
 *   /sobre /produto /comerciantes /faq /ecras /verificar   404 here, 200 there
 *   /suporte                                               200 on BOTH — the
 *     developer portal serves its own support page, so a relative link is
 *     correct for it and it is deliberately absent from this list.
 */
const MAIN_SITE_ONLY = ['/sobre', '/produto', '/comerciantes', '/faq', '/ecras', '/verificar'];

function pages(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) pages(p, acc);
    else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) acc.push(p);
  }
  return acc;
}

describe('Developer portal — cross-host links', () => {
  it('never links to a main-site-only route with a relative href', () => {
    const offenders: string[] = [];
    for (const file of pages(DEV)) {
      const src = readFileSync(file, 'utf8');
      for (const route of MAIN_SITE_ONLY) {
        // A relative href/Link to a route this host does not serve.
        const re = new RegExp(`href=["']${route}(["'/])`, 'g');
        if (re.test(src)) offenders.push(`${file.replace(process.cwd() + '/', '')} → ${route}`);
      }
    }
    expect(offenders, `relative links to main-site-only routes:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the sign-in consent links resolve to the canonical host', () => {
    const login = readFileSync(join(DEV, 'login/page.tsx'), 'utf8');
    expect(login).toContain('Termos de Serviço');
    expect(login).toContain('Política de Privacidade');
    // Both must be absolute to banzami.com, and open safely.
    const absolute = (login.match(/https:\/\/banzami\.com\/sobre/g) || []).length;
    expect(absolute, 'both consent links must point at banzami.com').toBeGreaterThanOrEqual(2);
    expect(login).toContain('rel="noopener noreferrer"');
  });
});
