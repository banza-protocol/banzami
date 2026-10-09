/**
 * validation-sandbox-stack — which containers ARE the Sandbox, asked of the
 * host rather than remembered.
 *
 * Every validation tool used to carry the Sandbox's Postgres and Redis
 * container names as literals, run id included. On 2026-10-06 the Sandbox was
 * rebuilt from empty under a new run id, and each of those tools went on
 * addressing a stack that no longer existed: "No such container", from guards
 * whose subject was something else entirely.
 *
 * A run id is a fact about one deployment. So this asks the host which
 * `bzsandbox-*` stack is running, and refuses to guess: none, or more than
 * one, is an error that names what it found. An explicit
 * BANZAMI_SANDBOX_PG / BANZAMI_SANDBOX_REDIS still wins, for a lab.
 *
 * Lazy and cached: nothing here runs at import, so a tool that never touches
 * the host (and CI, which cannot reach it) pays nothing.
 */
import { execFileSync } from 'node:child_process';

const HOST = process.env.BANZAMI_SANDBOX_HOST || 'root@217.160.9.248';
const SERVICES = { postgres: 'postgres-1', redis: 'redis-1' };
const OVERRIDE = { postgres: 'BANZAMI_SANDBOX_PG', redis: 'BANZAMI_SANDBOX_REDIS' };
const cache = new Map();

/** Pure: choose the one container for `service` out of the names running. */
export function pickSandboxContainer(names, service) {
  const suffix = SERVICES[service];
  if (!suffix) throw new Error(`unknown Sandbox service: ${service}`);
  const re = new RegExp(`^bzsandbox-[0-9]+-[0-9]+-[0-9]+-${suffix}$`);
  const found = names.filter((n) => re.test(n));
  if (found.length === 1) return found[0];
  throw new Error(found.length === 0
    ? `no running bzsandbox-*-${suffix} container on the Sandbox host`
    : `more than one Sandbox stack is running (${found.join(', ')}); ` +
      `name the one you mean with ${OVERRIDE[service]}`);
}

/** The running Sandbox container for `service` ('postgres' | 'redis'). */
export function sandboxContainer(service) {
  const explicit = process.env[OVERRIDE[service] ?? ''];
  if (explicit) return explicit;
  if (!cache.has(service)) {
    const out = execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=25', HOST,
      "docker ps --format '{{.Names}}'"], { encoding: 'utf8' });
    cache.set(service, pickSandboxContainer(out.split('\n').map((s) => s.trim()).filter(Boolean), service));
  }
  return cache.get(service);
}
