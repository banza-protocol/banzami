// Opaque server-side Web session store (WEB-APP-001 §2–§10).
//
// The browser cookie carries ONLY a high-entropy random opaque id. Everything
// else — the consumer identity reference, the upstream Consumer credential, the
// CSRF nonce, timestamps, client surface — lives here, server-side, keyed by
// that id. The cookie never contains the Bearer, encrypted or otherwise, so a
// stolen cookie is worthless once the server-side record is revoked or expires.
//
// Two backends, one interface:
//   • Redis (canonical stack store) via a tiny dependency-free RESP client —
//     durable across a host restart and safe across replicas.
//   • a JSON file — single-node dev fallback, still durable across a restart.
//
// No financial state, no ledger writes: this is authentication metadata.
import net from 'node:net';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function newSessionId() {
  // 32 random bytes → 43-char base64url. Unguessable; no structure to decode.
  return crypto.randomBytes(32).toString('base64url');
}

// ── At-rest encryption of the session record (§2) ─────────────────────────────
// The record — which holds the upstream Consumer Bearer — is sealed with
// AES-256-GCM under a dedicated server-side key before it ever reaches Redis or
// the file. A store-only compromise/dump reveals ciphertext, never the plaintext
// Bearer. The key is distinct from the CSRF secret, the cookie id and any
// Consumer/Project credential; it never reaches the browser and is never logged.
const STORE_ALG = 'aes-256-gcm';
function storeKey() {
  const raw = process.env.APP_WEB_SESSION_STORE_KEY;
  if (raw && raw.length >= 16) return crypto.createHash('sha256').update(raw).digest();
  if (process.env.NODE_ENV === 'production') {
    // Fail closed: no plaintext fallback in production.
    throw new Error('APP_WEB_SESSION_STORE_KEY (>=16 chars) is required in production');
  }
  return crypto.createHash('sha256').update('app-web-session-store-dev-key').digest();
}
const _STORE_KEY = storeKey();

// Seal a record object → base64url(iv | tag | ciphertext).
export function sealRecord(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(STORE_ALG, _STORE_KEY, iv);
  const pt = Buffer.from(JSON.stringify(obj), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64url');
}
// Open a sealed record → object, or null on any tamper/decrypt failure (fail closed).
export function openRecord(blob) {
  try {
    const buf = Buffer.from(blob, 'base64url');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const d = crypto.createDecipheriv(STORE_ALG, _STORE_KEY, iv);
    d.setAuthTag(tag);
    const pt = Buffer.concat([d.update(ct), d.final()]);
    return JSON.parse(pt.toString('utf8'));
  } catch {
    return null;
  }
}

// ── Minimal RESP (Redis) client over node:net — no dependency ─────────────────
class RedisClient {
  constructor(addr, password) {
    const [host, port] = addr.split(':');
    this.host = host || '127.0.0.1';
    this.port = parseInt(port || '6379', 10);
    this.password = password || ''; // never logged
    this.sock = null;
    this.connecting = null;
    this.pending = []; // { resolve, reject }
    this.buf = Buffer.alloc(0);
  }

  _connect() {
    if (this.sock && !this.sock.destroyed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      s.setNoDelay(true);
      s.on('connect', () => {
        this.sock = s; this.connecting = null;
        // AUTH first if the deployed Redis requires a password/ACL. Queued ahead
        // of any real command; its reply is consumed by the pending queue.
        if (this.password) this.cmd('AUTH', this.password).catch(() => {});
        resolve();
      });
      s.on('data', (d) => this._onData(d));
      s.on('error', (e) => { this._failAll(e); if (this.connecting) { this.connecting = null; reject(e); } });
      s.on('close', () => { this.sock = null; this._failAll(new Error('redis connection closed')); });
    });
    return this.connecting;
  }

  _failAll(err) {
    const p = this.pending; this.pending = []; this.buf = Buffer.alloc(0);
    for (const { reject } of p) reject(err);
  }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    let parsed;
    while ((parsed = this._parse(this.buf)) !== null) {
      this.buf = this.buf.subarray(parsed.consumed);
      const waiter = this.pending.shift();
      if (!waiter) continue;
      if (parsed.error) waiter.reject(new Error(parsed.error));
      else waiter.resolve(parsed.value);
    }
  }

  // Parse ONE reply from buf; return { value|error, consumed } or null if partial.
  _parse(buf) {
    if (buf.length === 0) return null;
    const nl = buf.indexOf('\r\n');
    if (nl === -1) return null;
    const type = String.fromCharCode(buf[0]);
    const line = buf.subarray(1, nl).toString('latin1');
    const headerEnd = nl + 2;
    switch (type) {
      case '+': return { value: line, consumed: headerEnd };
      case '-': return { error: line, consumed: headerEnd };
      case ':': return { value: parseInt(line, 10), consumed: headerEnd };
      case '$': {
        const len = parseInt(line, 10);
        if (len === -1) return { value: null, consumed: headerEnd };
        const end = headerEnd + len + 2;
        if (buf.length < end) return null;
        return { value: buf.subarray(headerEnd, headerEnd + len).toString('utf8'), consumed: end };
      }
      case '*': {
        // Not used by this store's commands; consume defensively as null.
        return { value: null, consumed: headerEnd };
      }
      default: return { error: `unexpected RESP type ${type}`, consumed: headerEnd };
    }
  }

  async cmd(...args) {
    await this._connect();
    const parts = [`*${args.length}\r\n`];
    for (const a of args) {
      const s = String(a);
      parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`);
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.sock.write(parts.join(''), (err) => { if (err) reject(err); });
    });
  }
}

class RedisSessionStore {
  constructor(addr, prefix = 'bzweb:sess:') {
    this.r = new RedisClient(addr, process.env.SESSION_REDIS_PASSWORD);
    this.prefix = prefix;
  }
  async get(id) {
    const v = await this.r.cmd('GET', this.prefix + id);
    return v ? openRecord(v) : null; // tamper/decrypt failure → null → fail closed
  }
  async set(id, record, ttlMs) {
    await this.r.cmd('SET', this.prefix + id, sealRecord(record), 'PX', Math.max(1000, ttlMs));
  }
  async touchTtl(id, ttlMs) {
    await this.r.cmd('PEXPIRE', this.prefix + id, Math.max(1000, ttlMs));
  }
  async del(id) {
    await this.r.cmd('DEL', this.prefix + id);
  }
  async ping() { const v = await this.r.cmd('PING'); return v === 'PONG'; }
  // Fixed-window counter shared across replicas and self-expiring, so a restart
  // or a second replica cannot reset/bypass it (§13).
  async rateLimitHit(key, windowMs, max) {
    const k = 'bzweb:rl:' + key;
    const n = await this.r.cmd('INCR', k);
    if (n === 1) await this.r.cmd('PEXPIRE', k, Math.max(1000, windowMs));
    return n > max;
  }
  kind() { return `redis(${this.r.host}:${this.r.port})`; }
}

// ── File backend: durable across a host restart, single node ──────────────────
class FileSessionStore {
  constructor(file) {
    this.file = file;
    this.map = new Map(); // id -> { record, expiresAt }
    this._loaded = this._load();
    // periodic sweep of expired entries
    this._timer = setInterval(() => this._sweep(), 60_000);
    this._timer.unref?.();
  }
  async _load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) this.map.set(k, v);
    } catch { /* no file yet */ }
  }
  async _persist() {
    const obj = {};
    for (const [k, v] of this.map) obj[k] = v;
    await fs.mkdir(path.dirname(this.file), { recursive: true }).catch(() => {});
    await fs.writeFile(this.file, JSON.stringify(obj));
  }
  _sweep() {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of this.map) if (v.expiresAt <= now) { this.map.delete(k); changed = true; }
    if (changed) this._persist().catch(() => {});
  }
  async get(id) {
    await this._loaded;
    const e = this.map.get(id);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) { this.map.delete(id); await this._persist(); return null; }
    const rec = openRecord(e.ct); // tamper/decrypt failure → null → fail closed
    if (rec === null) { this.map.delete(id); await this._persist(); return null; }
    return rec;
  }
  async set(id, record, ttlMs) {
    await this._loaded;
    this.map.set(id, { ct: sealRecord(record), expiresAt: Date.now() + Math.max(1000, ttlMs) });
    await this._persist();
  }
  async touchTtl(id, ttlMs) {
    await this._loaded;
    const e = this.map.get(id);
    if (e) { e.expiresAt = Date.now() + Math.max(1000, ttlMs); await this._persist(); }
  }
  async del(id) {
    await this._loaded;
    if (this.map.delete(id)) await this._persist();
  }
  async ping() { await this._loaded; return true; }
  // Single-node fallback: an in-memory sliding window (this backend is single
  // replica by definition, so there is nothing to share).
  async rateLimitHit(key, windowMs, max) {
    this._rl ??= new Map();
    const now = Date.now();
    const arr = (this._rl.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now); this._rl.set(key, arr);
    if (this._rl.size > 5000) for (const [k, v] of this._rl) if (!v.some((t) => now - t < windowMs)) this._rl.delete(k);
    return arr.length > max;
  }
  kind() { return `file(${this.file})`; }
}

export function createSessionStore() {
  const addr = process.env.SESSION_REDIS_ADDR || process.env.REDIS_ADDR;
  if (addr) return new RedisSessionStore(addr);
  const file = process.env.SESSION_STORE_FILE
    || path.join(process.env.TMPDIR || '/tmp', 'bzweb-sessions.json');
  return new FileSessionStore(file);
}
