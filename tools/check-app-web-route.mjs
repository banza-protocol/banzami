#!/usr/bin/env node
// check-app-web-route.mjs — guard that the public app.banzami.com route is served
// (WEB-APP-001 §10). Detects loss of the edge route (e.g. after an edge recreate
// that dropped the additive block — see EDGE-RECONCILE-001). Read-only.
const HOST = process.env.APP_WEB_HOST || 'app.banzami.com';
const url = `https://${HOST}/healthz`;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 200 && body.service === 'app-banzami-web') {
    console.log(`app-web-route OK: ${url} -> 200 (${body.service}, version ${body.version || 'n/a'}, session_store=${body.session_store})`);
    process.exit(0);
  }
  console.error(`app-web-route FAIL: ${url} -> ${res.status} ${JSON.stringify(body)}`);
  process.exit(1);
} catch (e) {
  console.error(`app-web-route FAIL: ${url} unreachable (${e.name})`);
  process.exit(1);
}
