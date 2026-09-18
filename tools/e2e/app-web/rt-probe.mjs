// Business realtime, isolated: sign in, STAY on Home, get paid, watch.
// No charge creation, no navigation — so a failure here is realtime itself.
import { launchChromium } from './lib/browser.mjs';
import { FlutterSemanticsDriver } from './lib/semantics-driver.mjs';
import { provisionBusiness } from './lib/business-provision.mjs';
import { businessWebSignIn } from './lib/business-signin.mjs';
const APP = process.env.APP_ORIGIN || 'https://app.banzami.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (k, v) => console.log(`  ${k}: ${v}`);
const kz = (t) => { const m = (t.match(/Saldo dispon[ií]vel[\s·]*([\d\s]+)\s*Kz/i) || [])[1]; return m ? parseInt(m.replace(/\s/g, ''), 10) : null; };

const { browser } = await launchChromium();
const biz = await provisionBusiness({});
const page = await (await browser.newContext()).newPage();
await page.goto(`${APP}/business`, { waitUntil: 'domcontentloaded', timeout: 45000 });
const d = new FlutterSemanticsDriver(page, { label: 'rt' });
await d.enableSemantics();
await businessWebSignIn(d, biz);
await d.waitForText('Saldo disponível', { timeout: 30000 });
say('HOME BEFORE', kz(await d.visibleText()));

// Pay the Business through its persistent Receive Point, from a fresh consumer.
const cs = {}; const cch = () => Object.entries(cs).map(([k, v]) => `${k}=${v}`).join('; ');
const grab = (r) => { for (const c of (r.headers.getSetCookie?.() ?? [])) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) cs[m[1]] = m[2]; } };
const req = async (m, p, b) => { const h = { cookie: cch() }; if (b !== undefined) { h['content-type'] = 'application/json'; h['x-csrf-token'] = cs['bz_app_csrf'] || ''; }
  const r = await fetch(`${APP}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined }); grab(r);
  let j = null; try { j = await r.clone().json(); } catch {} return { status: r.status, body: j }; };
grab(await fetch(`${APP}/`));
await req('POST', '/consumer/v1/auth/register', { handle: `rtbuyer${Date.now().toString(36)}`, display_name: 'RT Buyer', pin: '481516' });
await req('POST', '/consumer/v1/sandbox/fund', { amount_minor: 500000, currency: 'AOA' });
// Pay the Business through its PERSISTENT Receive Point (ADR-065) — the path a
// payer actually uses, and the one proof 15 exercises via a charge link.
const slug = process.env.RP_SLUG;
const pay = await req('POST', `/consumer/v1/payment-links/${slug}/pay`, { amount_minor: 70000, idempotency_key: `rt-${Date.now()}` });
say('PAY STATUS', pay.status);
say('PAY BODY', JSON.stringify(pay.body).slice(0, 200));

for (let i = 0; i < 20; i++) {
  await sleep(1500);
  const v = kz(await d.visibleText());
  if (v) { say('CONVERGED AFTER', `${(i + 1) * 1.5}s → ${v} Kz`); break; }
  if (i === 19) say('NEVER CONVERGED', `still ${v} Kz after 30s`);
}
await page.reload({ waitUntil: 'domcontentloaded' }); await d.enableSemantics(); await sleep(4000);
say('AFTER MANUAL RELOAD', kz(await d.visibleText()));
await browser.close(); process.exit(0);
