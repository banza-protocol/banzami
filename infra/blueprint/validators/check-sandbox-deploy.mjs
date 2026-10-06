#!/usr/bin/env node
// Banzami Environment Blueprint — static validator for the provenance-first deployment adapter.
// Asserts the four-service allowlist, provenance-before-health, no build/pull/mutable-tag,
// one-at-a-time, file-only in-process DB credential, non-root, internal-only networking, and
// no host namespaces/ports/socket/mounts — without deploying anything.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SB = resolve(ROOT, 'sandbox-ops');
let failed = 0;
const pass = (n, m) => console.log(`  ✓ [${n}] ${m}`);
const fail = (n, m) => { console.error(`  ✗ [${n}] ${m}`); failed++; };
const d = readFileSync(resolve(SB, 'scripts', 'sandbox-deploy.sh'), 'utf8');
const FOUR = ['core-api-staging', 'api-gateway-staging', 'developer-api', 'public-api-staging'];
const FORBIDDEN = ['admin-api', 'dashboard', 'checkout', 'pay', 'banzai', 'banza-docs'];

// 1. exactly the four approved services; forbidden rejected
{
  const all = FOUR.every(s => d.includes(s));
  // The CEREMONY deploys exactly the four core services; forbidden services (admin-api, pay,
  // etc.) may appear in DEPLOY_ONE_ALLOWED_SERVICES (app-plane deploy-one) but NEVER in the
  // ceremony set.
  const ceremony = (d.match(/CEREMONY_APPLY_SERVICES=\(([^)]*)\)/) || [])[1] || '';
  const noForbidden = ceremony !== '' && FOUR.every(s => ceremony.includes(s)) && !FORBIDDEN.some(s => ceremony.includes(s));
  const rejects = /allow_ok "\$name" \|\| die/.test(d) && /is forbidden/.test(d);
  (all && noForbidden && rejects) ? pass(1, 'exactly the four approved services; forbidden services rejected') : fail(1, `allowlist (all=${all} noForbidden=${noForbidden} rejects=${rejects})`);
}
// 2. provenance-before-health, one at a time
{
  const provFirst = /provenance validation BEFORE load\/deploy/.test(d) && /validate_service "\$name"[\s\S]*deploy_one/.test(d);
  // The ceremony iterates DEPLOY_ONE_ALLOWED_SERVICES filtered to the ceremony set, one at a time.
  const oneAtATime = /for e in "\$\{DEPLOY_ONE_ALLOWED_SERVICES\[@\]\}"; do[\s\S]*?is_ceremony_service[\s\S]*?deploy_one/.test(d);
  (provFirst && oneAtATime) ? pass(2, 'provenance validated before deployment; one service at a time') : fail(2, `sequence (prov=${provFirst} seq=${oneAtATime})`);
}
// 3. no build / no pull / no mutable tag — load only + digest match
{
  const loadOnly = /docker load -i "\$RELEASE_ROOT\/\$name\.tar"/.test(d) && !/buildx build|docker build|docker pull/.test(d);
  const digest = /loaded digest != manifest/.test(d) && /image_identity_matches/.test(d);
  (loadOnly && digest) ? pass(3, 'no build, no pull; image loaded from package with manifest-digest match') : fail(3, `immutable (load=${loadOnly} digest=${digest})`);
}
// 4. file-only in-process secrets — per-service DB credential + JWT signing secret (never in env)
//    WALLET-NATIVE-001: each service reads its OWN db_url_<service>, mounted at /run/secrets and
//    exported in-process by the entrypoint (never a Docker -e), then verified absent from the env.
{
  const dbCred = /db_url_core:DATABASE_URL/.test(d)
    && /-v "\$EVIDENCE_ROOT\/\$sf:\/run\/secrets\/\$sf:ro"/.test(d)
    && !/-e "DATABASE_URL=/.test(d);
  const jwtCred = /jwt_secret:JWT_SECRET/.test(d) && !/-e "JWT_SECRET=/.test(d);
  const inProcExec = /export "\$v"="\$\(cat "\$f"\)"; done; exec /.test(d);
  const verifyNoSecret = /no_secret_in_env/.test(d) && /DATABASE_URL=\|password=/.test(d);
  (dbCred && jwtCred && inProcExec && verifyNoSecret) ? pass(4, 'per-service DB + JWT secrets file-only + exported in-process (never in Docker env); verified absent from inspectable env') : fail(4, `secret boundary (db=${dbCred} jwt=${jwtCred} exec=${inProcExec} verify=${verifyNoSecret})`);
}
// 5. non-root + health via real contract + no host port
{
  const nonRoot = /id -u 2>\/dev\/null.*!= "0"|!= "0".*id -u/.test(d) && /non_root/.test(d);
  const health = /State\.Health\.Status/.test(d) && /deployed_and_healthy/.test(d) && !/echo.*healthy.*PASS.*fabricat/.test(d);
  const noPort = /no_host_port/.test(d) && /docker port "\$cname"/.test(d);
  (nonRoot && health && noPort) ? pass(5, 'non-root verified; health via the image HEALTHCHECK contract; no host-published port') : fail(5, `runtime (nonRoot=${nonRoot} health=${health} noPort=${noPort})`);
}
// 6. internal networking only; no host namespaces / privileged / socket / host mount
{
  const internal = /--network "\$BZSB_DATA_NET"/.test(d) && /network connect "\$BZSB_APP_NET"/.test(d);
  const hardened = /--security-opt "no-new-privileges:true"/.test(d)
    && !/--privileged/.test(d) && !/--network host|--net=host/.test(d) && !/--pid host/.test(d) && !/--ipc host/.test(d)
    && !/\/var\/run\/docker\.sock/.test(d) && !/-v \/[^:]*:\/[^:]*(:|$)/.test(d.replace(/\$DBURL_FILE:\/run\/secrets\/db_url:ro/g, ''));
  (internal && hardened) ? pass(6, 'internal data+app networks; no-new-privileges; no privileged/host-namespace/socket/host mount') : fail(6, `isolation (internal=${internal} hardened=${hardened})`);
}
// 7. no credential literal / no VM contact
{
  const CRED = /(postgres(ql)?|mysql):\/\/[^/\s"']+:[A-Za-z0-9]{6,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
  (!/217\.160\.9\.248|ssh /.test(d) && !CRED.test(d)) ? pass(7, 'no VM contact; no credential literal') : fail(7, 'VM contact or credential literal present');
}

// 8. the ceremony apply path asserts evidence secret modes (0644) before mounting them into the
//    four services, so a file left non-0644 upstream (recursive chmod during transfer, or
//    runtime-authority rewriting over an existing file) cannot make a non-root container's
//    db_url unreadable and fail the deploy closed.
{
  const apply = d.slice(d.indexOf('cmd_apply()'), d.indexOf('cmd_verify()'));
  /assert_secret_modes "\$EVIDENCE_ROOT"/.test(apply)
    ? pass(8, 'ceremony cmd_apply asserts evidence secret modes (0644) before the deploy loop')
    : fail(8, 'cmd_apply does not assert_secret_modes on $EVIDENCE_ROOT');
}

console.log('');
if (failed) { console.error(`check-sandbox-deploy: ${failed} check(s) FAILED`); process.exit(1); }
console.log('check-sandbox-deploy: all checks passed');
