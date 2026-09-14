#!/usr/bin/env node
/**
 * Mutation proof for tools/check-public-site-truth.mjs.
 *
 * Each case copies what the gate reads into a scratch tree, reintroduces one
 * drift the site really had (or could have), and requires the gate to fail on
 * the counter that names it. The unmodified copy must pass.
 *
 *   node tools/check-public-site-truth.selftest.mjs
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const GATE = join(ROOT, 'tools/check-public-site-truth.mjs');
const COPY = [
  'apps/website/app', 'apps/website/components', 'apps/website/lib',
  'docs/developer/openapi', 'quality/operator-assurance-manifest.yaml', 'services', 'evidence/assurance/sdk',
];

function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'bz-pubtruth-'));
  for (const p of COPY) {
    cpSync(join(ROOT, p), join(dir, p), {
      recursive: true,
      filter: (src) => !/node_modules|\.next|\/vendor\/|\.git\b/.test(src) && (!/services/.test(src) || !/\.[a-z]+$/.test(src) || /\.go$/.test(src)),
    });
  }
  return dir;
}
const edit = (dir, file, fn) => {
  const p = join(dir, file);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`mutation did not change ${file}`);
  writeFileSync(p, after);
};
const run = (dir) => {
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, BZ_PUBLIC_TRUTH_ROOT: dir }, encoding: 'utf8' });
  const counters = Object.fromEntries([...(r.stdout ?? '').matchAll(/^([A-Z_]+)=(\S+)$/gm)].map((m) => [m[1], m[2]]));
  return { code: r.status, counters, out: `${r.stdout}${r.stderr}` };
};
const W = 'apps/website';
const fails = (key) => (c) => c.code !== 0 && Number(c.counters[key]) >= 1;

const CASES = [
  { name: 'baseline copy passes', mutate: () => {}, expect: (c) => c.code === 0 && c.counters.PUBLIC_SITE_TRUTH === 'PASS' },
  {
    name: 'legacy — the FAQ documents a /v1/business/ route again',
    mutate: (d) => edit(d, `${W}/app/faq/page.tsx`, (s) => s.replace("q: 'Existe uma API?',", "q: 'Existe uma API? Veja /v1/business/payments',")),
    expect: fails('PUBLIC_SITE_LEGACY_API_REFS'),
  },
  {
    name: 'legacy — a nav link points into the retired /developers#api reference',
    mutate: (d) => edit(d, `${W}/lib/nav-menus.ts`, (s) => s.replace("href: '/developers',\n    hasMega", "href: '/developers#api',\n    hasMega")),
    expect: fails('PUBLIC_SITE_LEGACY_API_REFS'),
  },
  {
    name: 'SDK — the Produto card lists Python and PHP SDKs again',
    mutate: (d) => edit(d, `${W}/app/produto/page.tsx`, (s) => s.replace("title: 'SDKs',", "title: 'SDKs Python e PHP',")),
    expect: fails('PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS'),
  },
  {
    name: 'SDK — an install command for a package that is not published',
    mutate: (d) => edit(d, `${W}/app/developers/page.tsx`, (s) => s.replace('<li>Dinheiro fictício: nada entra ou sai de um banco.</li>', '<li>Dinheiro fictício: nada entra ou sai de um banco. npm install @banzami/checkout</li>')),
    expect: fails('PUBLIC_SITE_UNPUBLISHED_SDK_CLAIMS'),
  },
  {
    name: 'version — the facts module claims v2',
    mutate: (d) => edit(d, `${W}/lib/public-truth.ts`, (s) => s.replace("apiVersion: 'v1'", "apiVersion: 'v2'")),
    expect: fails('PUBLIC_SITE_API_VERSION_DRIFT'),
  },
  {
    name: 'live — the homepage store badges come back',
    mutate: (d) => edit(d, `${W}/app/page.tsx`, (s) => s.replace('Construir na Sandbox', 'DISPONÍVEL NA App Store')),
    expect: fails('PUBLIC_SITE_LIVE_CLAIMS'),
  },
  {
    name: 'live — the facts module says Financial Live is available',
    mutate: (d) => edit(d, `${W}/lib/public-truth.ts`, (s) => s.replace("status: 'NOT_READY' as const", "status: 'AVAILABLE' as const")),
    expect: fails('PUBLIC_SITE_LIVE_CLAIMS'),
  },
  {
    name: 'live — a mock screen says Multicaixa Express integrado again',
    mutate: (d) => edit(d, `${W}/components/app/AppDemo.tsx`, (s) => s.replace("t: 'Comprovativo verificável'", "t: 'Multicaixa Express integrado'")),
    expect: fails('PUBLIC_SITE_LIVE_CLAIMS'),
  },
  {
    name: 'live — the Suporte page claims a BNA licence',
    mutate: (d) => edit(d, `${W}/app/suporte/page.tsx`, (s) => s.replace('Como podemos ajudar?', 'Operador com licença do BNA.')),
    expect: fails('PUBLIC_SITE_LIVE_CLAIMS'),
  },
  {
    name: 'sandbox — the old "Candidate um Business" onboarding returns',
    mutate: (d) => edit(d, `${W}/app/developers/page.tsx`, (s) => s.replace('Comece na Sandbox.', 'Candidate um Business para aceder.')),
    expect: fails('PUBLIC_SITE_SANDBOX_APPROVAL_DRIFT'),
  },
  {
    name: 'keys — a Stripe-shaped key example appears',
    mutate: (d) => edit(d, `${W}/app/faq/page.tsx`, (s) => s.replace('Uma chave secreta fica sempre no seu servidor.', 'Uma chave secreta (sk_live_…) fica sempre no seu servidor.')),
    expect: fails('PUBLIC_SITE_KEY_PREFIX_DRIFT'),
  },
  {
    name: 'keys — the facts module names a prefix the runtime does not issue',
    mutate: (d) => edit(d, `${W}/lib/public-truth.ts`, (s) => s.replace("secret: 'bz_test_sk_'", "secret: 'bz_sandbox_sk_'")),
    expect: fails('PUBLIC_SITE_KEY_PREFIX_DRIFT'),
  },
  {
    name: 'status — the Footer stops rendering the environment facts',
    mutate: (d) => edit(d, `${W}/components/site/Footer.tsx`, (s) => s.replace("import { PUBLIC_TRUTH } from '@/lib/public-truth';\n", 'const PUBLIC_TRUTH = { sandbox: { name: "" }, live: { name: "" } };\n')),
    expect: fails('PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING'),
  },
  {
    name: 'status — the banner goes back to "ambiente de testes" only',
    mutate: (d) => edit(d, `${W}/components/PlatformBanner.tsx`, (s) => s.replace('Dinheiro fictício. O Financial Live está indisponível.', 'Esta plataforma encontra-se em ambiente de testes.')),
    expect: fails('PUBLIC_SITE_ENVIRONMENT_STATUS_MISSING'),
  },
  {
    name: 'competitor — a product page names a competitor',
    mutate: (d) => edit(d, `${W}/app/sobre/page.tsx`, (s) => s.replace('Pagamentos em Kwanza, de carteira para carteira.', 'Mais simples do que o Stripe.')),
    expect: fails('PUBLIC_SITE_COMPETITOR_MENTIONS'),
  },
  {
    name: 'copy — a speed promise and a waitlist return',
    mutate: (d) => edit(d, `${W}/components/site/CTASection.tsx`, (s) => s.replace('Construa com o Banzami.', 'Receba em segundos. Entre na waitlist.')),
    expect: (c) => fails('PUBLIC_SITE_UNSUPPORTED_COPY')(c) && /speed promise/.test(c.out) && /waitlist/.test(c.out),
  },
  {
    name: 'copy — "Em breve" roadmap items return to the menu',
    mutate: (d) => edit(d, `${W}/lib/nav-menus.ts`, (s) => s.replace("desc: 'Respostas curtas.'", "desc: 'Em breve.'")),
    expect: fails('PUBLIC_SITE_UNSUPPORTED_COPY'),
  },
  {
    name: 'copy — the "tu" form returns',
    mutate: (d) => edit(d, `${W}/app/not-found.tsx`, (s) => s.replace('O endereço que procura', 'O endereço que procuras')),
    expect: fails('PUBLIC_SITE_UNSUPPORTED_COPY'),
  },
  {
    name: 'email — the email_off pair is removed from the layout',
    mutate: (d) => edit(d, `${W}/app/layout.tsx`, (s) => s.replace("__html: '<!--email_off-->'", "__html: ''")),
    expect: fails('PUBLIC_EMAIL_OBFUSCATION_BROKEN'),
  },
  {
    name: 'comments do not count — history in a comment passes',
    mutate: (d) => edit(d, `${W}/app/page.tsx`, (s) => s.replace('// What is available today.', '// It used to say DISPONÍVEL NA App Store and em segundos. What is available today.')),
    expect: (c) => c.code === 0,
  },
];

let failed = 0;
for (const k of CASES) {
  const dir = tree();
  try {
    k.mutate(dir);
    const r = run(dir);
    const ok = k.expect(r);
    console.log(`  ${ok ? '✓' : '✗'} ${k.name}${ok ? '' : `\n      exit ${r.code} ${JSON.stringify(r.counters)}\n${r.out.split('\n').filter((l) => /✗/.test(l)).slice(0, 6).join('\n')}`}`);
    if (!ok) failed += 1;
  } catch (e) {
    console.log(`  ✗ ${k.name}: ${e.message}`);
    failed += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nPUBLIC_SITE_TRUTH_MUTATIONS=${CASES.length - 2}`);
console.log(`PUBLIC_SITE_TRUTH_SELFTEST=${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed ? 1 : 0);
