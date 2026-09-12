/**
 * Refuse to measure the Console until the session actually opens it.
 *
 * On 2026-09-12 the locale, accessibility and responsive sweeps all reported
 * green — 24/24, 29/29, 36 passes — against the LOGIN page. The session handed
 * to them was rejected by the API (401), every route redirected to sign-in, and
 * each sweep dutifully measured that screen: it has Portuguese copy, its
 * controls are labelled, and it does not scroll sideways. Every assertion was
 * true and none of them was about the product.
 *
 * A sweep that cannot reach the thing it audits must fail, loudly, rather than
 * pass on whatever it was shown. This is the precondition; it runs before any
 * measurement and exits non-zero if the session is not live.
 */
export async function requireLiveSession(session, api = 'https://developer-api.banzami.com') {
  if (!session || !session.trim()) {
    console.error('✗ BZ_SESSION is empty — nothing to authenticate with');
    process.exit(2);
  }
  let res;
  try {
    res = await fetch(`${api}/auth/me`, {
      headers: { cookie: `__Host-bz_dev_session=${session}`, origin: 'https://developers.banzami.com' },
    });
  } catch (e) {
    console.error(`✗ could not reach ${api} to verify the session: ${e}`);
    process.exit(2);
  }
  if (res.status !== 200) {
    console.error(
      `✗ the session is not valid (${api}/auth/me -> ${res.status}).\n` +
      '  Every route would render the sign-in page and this sweep would report green\n' +
      '  about a screen with no product on it. Mint a working session and re-run:\n' +
      '    node tools/e2e/console/mint-session.mjs',
    );
    process.exit(2);
  }
  const body = await res.json().catch(() => ({}));
  // /auth/me nests the person under `user`; reading body.email gave "(unknown)"
  // on a perfectly good session and made the guard's own log untrustworthy.
  const me = body.user ?? body;
  if (!me?.email) {
    console.error('✗ /auth/me returned 200 with no identity — refusing to measure an unidentified session');
    process.exit(2);
  }
  console.log(`  session verified: signed in as ${me.email}`);
  return me;
}

/**
 * Prove the PAGE is the Console, not the sign-in screen, before counting a
 * single assertion about it.
 *
 * A valid session is not enough. The earlier false all-clear happened with the
 * cookie set on the wrong host: the API accepted it, the browser sent nothing
 * with the document request, every route rendered sign-in, and three sweeps
 * measured that screen quite correctly. Session validity and page identity are
 * different facts and both have to be checked.
 *
 * Throws — the caller must abort the route rather than record a pass or a fail,
 * because neither verdict would be about the product.
 */
export async function assertAuthenticatedShell(page, route) {
  const url = new URL(page.url());
  if (/\/(login|verify|signin|sign-in)/.test(url.pathname)) {
    throw new Error(`${route}: redirected to ${url.pathname} — this is the sign-in page, not the Console`);
  }
  const marks = await page.evaluate(() => ({
    // The account control the shell always renders for a signed-in person.
    avatar: document.querySelectorAll('button[aria-label^="A sua conta"]').length,
    // The workspace selector, which only an authenticated shell has.
    workspace: document.body.innerText.includes('WORKSPACE'),
    // The sign-in form, which it must NOT have.
    emailField: document.querySelectorAll('input[type="email"]').length,
    signInCopy: /Bem-vindo\(a\)|Insira o seu email/.test(document.body.innerText),
  }));
  if (marks.signInCopy || (marks.emailField > 0 && marks.avatar === 0)) {
    throw new Error(`${route}: the sign-in form is on screen — the sweep would be measuring it`);
  }
  if (marks.avatar === 0 && !marks.workspace) {
    throw new Error(`${route}: no authenticated shell (no account control, no workspace selector)`);
  }
  return marks;
}
