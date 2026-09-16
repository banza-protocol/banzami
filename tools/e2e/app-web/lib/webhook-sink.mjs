/**
 * The Sandbox webhook sink stands in for a developer's own receiving server —
 * the same declared dependency the public cleanroom uses. It is told to answer
 * 2xx for a run, and its received requests are read back to prove genuine
 * delivery. Nothing secret is written; the raw bodies are the product's own
 * webhook payloads.
 */
import { execFileSync } from 'node:child_process';

export const SINK = 'https://sandbox-webhook.banzami.com/receive';
const HOST = process.env.BZ_SANDBOX_HOST ?? 'root@217.160.9.248';
const ssh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, cmd], { encoding: 'utf8', timeout: 60000 });

export function receiverOpen(run) {
  return ssh(`docker exec banzami-webhook-sink wget -qO- --post-data='{}' --header='content-type: application/json' 'http://127.0.0.1:8090/admin/configure?run=${run}'`);
}

export function received(run) {
  try {
    return JSON.parse(ssh(`docker exec banzami-webhook-sink wget -qO- 'http://127.0.0.1:8090/admin/requests?run=${run}'`)).requests ?? [];
  } catch {
    return [];
  }
}
