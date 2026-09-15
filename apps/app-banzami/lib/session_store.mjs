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

// ── Minimal RESP (Redis) client over node:net — no dependency ─────────────────
class RedisClient {
  constructor(addr) {
    const [host, port] = addr.split(':');
    this.host = host || '127.0.0.1';
    this.port = parseInt(port || '6379', 10);
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
      s.on('connect', () => { this.sock = s; this.connecting = null; resolve(); });
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
    this.r = new RedisClient(addr);
    this.prefix = prefix;
  }
  async get(id) {
    const v = await this.r.cmd('GET', this.prefix + id);
    return v ? JSON.parse(v) : null;
  }
  async set(id, record, ttlMs) {
    await this.r.cmd('SET', this.prefix + id, JSON.stringify(record), 'PX', Math.max(1000, ttlMs));
  }
  async touchTtl(id, ttlMs) {
    await this.r.cmd('PEXPIRE', this.prefix + id, Math.max(1000, ttlMs));
  }
  async del(id) {
    await this.r.cmd('DEL', this.prefix + id);
  }
  async ping() { const v = await this.r.cmd('PING'); return v === 'PONG'; }
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
    return e.record;
  }
  async set(id, record, ttlMs) {
    await this._loaded;
    this.map.set(id, { record, expiresAt: Date.now() + Math.max(1000, ttlMs) });
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
  kind() { return `file(${this.file})`; }
}

export function createSessionStore() {
  const addr = process.env.SESSION_REDIS_ADDR || process.env.REDIS_ADDR;
  if (addr) return new RedisSessionStore(addr);
  const file = process.env.SESSION_STORE_FILE
    || path.join(process.env.TMPDIR || '/tmp', 'bzweb-sessions.json');
  return new FileSessionStore(file);
}
