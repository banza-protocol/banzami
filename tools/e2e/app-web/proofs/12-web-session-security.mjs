#!/usr/bin/env node
/**
 * APP-BANZAMI-WEB-BUSINESS-001 — Proof 12: dual-context session security (ADR-066).
 *
 * Drives the LIVE BFF over HTTP with real cookie jars (no browser needed — this is
 * about session/authority semantics): separate authorities under one opaque cookie,
 * business-only logout, logout-all, session replay → 401, session-id rotation
 * (fixation), client-side context tamper cannot grant authority, and strict
 * cross-authority isolation (a consumer route never accepts business authority and
 * vice-versa). Generic synthetic Business + a fresh HTTP-registered consumer.
 *
 *   BANZAMI_E2E=RUN node proofs/12-web-session-security.mjs
 */
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';
import { provisionBusiness, retireBusiness } from '../lib/business-provision.mjs';
import { retireConsumer } from '../lib/consumer-retire.mjs';

const APP = process.env.APP_WEB_URL ?? 'https://app.banzami.com';
const R = new GateReport('12-web-session-security');

if (process.env.BANZAMI_E2E !== 'RUN') { console.error('set BANZAMI_E2E=RUN'); process.exit(2); }

function jar() {
  const store = {};
  const ch = () => Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; ');
  const grab = (res) => { const a = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of a) { const m = c.match(/^([^=]+)=([^;]*)/); if (m) { if (m[2] === '') delete store[m[1]]; else store[m[1]] = m[2]; } } };
  return {
    store,
    sid: () => store['bz_app_session'],
    csrf: () => store['bz_app_csrf'],
    async req(method, path, body) {
      const h = { cookie: ch() };
      if (body !== undefined) { h['content-type'] = 'application/json'; h['x-csrf-token'] = store['bz_app_csrf'] || ''; }
      const res = await fetch(`${APP}${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
      grab(res);
      let j = null; try { j = await res.clone().json(); } catch {}
      return { status: res.status, body: j };
    },
    async seed() { const r = await fetch(`${APP}/`); grab(r); return r; },
  };
}
async function registerConsumerHttp(j, handle) {
  await j.seed();
  return j.req('POST', '/consumer/v1/auth/register', { handle, display_name: 'E2E Sec', pin: '481516' });
}
async function loginBusinessHttp(j, biz) {
  if (!j.csrf()) await j.seed();
  return j.req('POST', '/business/api/v1/merchant/auth/token', { handle: biz.handle, pin: biz.pin });
}

(async () => {
  let biz;
  // Every consumer this proof creates, so the finally can retire them. They hold
  // no funding, but residue is residue: the Sandbox is shared and a synthetic
  // identity left alive is one more thing a later run has to reason about.
  const consumers = [];
  try {
    biz = await provisionBusiness({ handlePrefix: 'e2esec' });
    R.mark('GENERIC_SYNTHETIC_BUSINESS_PROVISIONED', !!biz.handle, `@${biz.handle}`);

    // ── Jar A: DUAL authority in one opaque cookie, with id rotation (fixation). ──
    const A = jar();
    await A.seed();
    const id0 = A.sid();
    const hA = `e2eseca${Date.now().toString(36)}`; consumers.push(hA);
    const reg = await registerConsumerHttp(A, hA);
    const id1 = A.sid();
    R.mark('CONSUMER_REGISTERED', reg.status === 200 || reg.status === 201, `HTTP ${reg.status}`);
    R.mark('DUAL_CONTEXT_SESSION_FIXATION', !!id0 && !!id1 && id0 !== id1, 'session id rotated on consumer sign-in');
    await loginBusinessHttp(A, biz);
    const id2 = A.sid();
    R.mark('SESSION_ID_ROTATES_ON_BUSINESS_SIGNIN', !!id2 && id2 !== id1, 'rotated again on business sign-in');
    const st = (await A.req('GET', '/session/state')).body || {};
    R.mark('CONSUMER_BUSINESS_WEB_SESSION_AUTHORITY_SEPARATION', st.personal === true && st.business === true, `personal=${st.personal} business=${st.business} in ONE cookie`);
    R.mark('WEB_SESSION_AUTHORITY_IN_COOKIE=0', A.sid().length >= 40 && !/bearer|jwt|merchant/i.test(JSON.stringify(A.store)), 'cookie is opaque; no credential in browser store');
    // both authorities work
    const cGet = await A.req('GET', '/consumer/v1/me');
    const bGet = await A.req('GET', '/business/api/v1/business/receive-point');
    R.mark('DUAL_AUTH_BOTH_ROUTES_WORK', cGet.status === 200 && bGet.status === 200, `consumer /me ${cGet.status}, business receive-point ${bGet.status}`);

    // ── Business-only logout: business drops, consumer stays; replay → 401. ──
    await A.req('POST', '/business/api/v1/merchant/auth/logout', {});
    const st2 = (await A.req('GET', '/session/state')).body || {};
    const cAfter = await A.req('GET', '/consumer/v1/me');
    const bAfter = await A.req('GET', '/business/api/v1/business/receive-point');
    R.mark('BUSINESS_ONLY_LOGOUT_E2E', st2.personal === true && st2.business === false && cAfter.status === 200, `after biz logout: personal=${st2.personal} business=${st2.business}, consumer /me ${cAfter.status}`);
    R.mark('BUSINESS_WEB_SESSION_REPLAY=401', bAfter.status === 401, `business route after logout → ${bAfter.status}`);

    // ── Jar B: business-only — cannot touch consumer money; context is not authority. ──
    const B = jar();
    await loginBusinessHttp(B, biz);
    const bTransfer = await B.req('POST', '/consumer/v1/transfers', { to_handle: 'x', amount_minor: 1 });
    R.mark('BUSINESS_AUTH_GRANTS_CONSUMER_FINANCIAL_AUTHORITY=0', bTransfer.status === 401, `business→consumer transfer → ${bTransfer.status}`);
    const setPersonal = await B.req('POST', '/session/context', { context: 'personal' });
    const bMe = await B.req('GET', '/consumer/v1/me');
    R.mark('ACTIVE_CONTEXT_GRANTS_AUTHORITY=0', bMe.status === 401, `active_context=personal but no consumer authority → /me ${bMe.status}`);

    // ── Jar C: consumer-only — cannot reach business routes; cannot tamper context. ──
    const C = jar();
    const hC = `e2esecc${Date.now().toString(36)}`; consumers.push(hC);
    await registerConsumerHttp(C, hC);
    const cBiz = await C.req('GET', '/business/api/v1/business/receive-point');
    R.mark('CONSUMER_AUTH_GRANTS_BUSINESS_ROUTE=0', cBiz.status === 401, `consumer→business route → ${cBiz.status}`);
    const tamper = await C.req('POST', '/session/context', { context: 'business' });
    R.mark('CONTEXT_SWITCH_CLIENT_TAMPER_AUTHORITY=0', tamper.status === 409, `switch to business without business auth → ${tamper.status} (refused)`);

    // ── Jar D: logout-all clears both; neither replays. ──
    const D = jar();
    const hD = `e2esecd${Date.now().toString(36)}`; consumers.push(hD);
    await registerConsumerHttp(D, hD);
    await loginBusinessHttp(D, biz);
    await D.req('POST', '/session/logout-all', {});
    const stD = (await D.req('GET', '/session/state')).body || {};
    const dC = await D.req('GET', '/consumer/v1/me');
    const dB = await D.req('GET', '/business/api/v1/business/receive-point');
    R.mark('WEB_LOGOUT_ALL_E2E', stD.personal === false && stD.business === false && dC.status === 401 && dB.status === 401, `after logout-all: personal=${stD.personal} business=${stD.business}; consumer ${dC.status}, business ${dB.status}`);
  } catch (e) {
    R.mark('PROOF_12', false, e.message);
  } finally {
    if (biz) await retireBusiness(biz.merchantId);
    for (const h of consumers) { try { retireConsumer(h, { runId: 'proof12' }); } catch { /* best effort */ } }
  }
  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_12_WEB_SESSION_SECURITY=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail) → ${out}`);
  process.exitCode = R.ok ? 0 : 1;
})();
