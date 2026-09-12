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
      '    bash tools/e2e/console/mint-console-session.sh <email> 120',
    );
    process.exit(2);
  }
  const me = await res.json().catch(() => ({}));
  console.log(`  session verified: signed in as ${me.email ?? '(unknown)'}`);
  return me;
}
