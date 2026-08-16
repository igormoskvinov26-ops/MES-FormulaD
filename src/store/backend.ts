import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Unified async persistence used for settings, Story state, meta and job locks.
 *
 * Backend is chosen automatically:
 *  - Vitest            → in-memory (hermetic tests, no disk)
 *  - Vercel KV present  → @vercel/kv (Upstash Redis) for serverless deploys
 *  - otherwise          → local JSON file (always-on / local dev)
 *
 * Keeping this behind one narrow interface means the serverless (stateless)
 * and always-on (stateful) deployments share identical business code.
 */
export interface StorageBackend {
  getRaw(key: string): Promise<string | null>;
  setRaw(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  /** Acquire a lock with TTL; returns an owner token, or null if held. */
  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, owner: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory (tests)
// ---------------------------------------------------------------------------
class MemoryBackend implements StorageBackend {
  private kv = new Map<string, string>();
  private locks = new Map<string, { owner: string; expiresAt: number }>();

  async getRaw(key: string) {
    return this.kv.get(key) ?? null;
  }
  async setRaw(key: string, value: string) {
    this.kv.set(key, value);
  }
  async del(key: string) {
    this.kv.delete(key);
  }
  async keys(prefix: string) {
    return [...this.kv.keys()].filter((k) => k.startsWith(prefix));
  }
  async acquireLock(key: string, ttlMs: number) {
    const now = Date.now();
    const cur = this.locks.get(key);
    if (cur && cur.expiresAt > now) return null;
    const owner = randomUUID();
    this.locks.set(key, { owner, expiresAt: now + ttlMs });
    return owner;
  }
  async releaseLock(key: string, owner: string) {
    const cur = this.locks.get(key);
    if (cur && cur.owner === owner) this.locks.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Local JSON file (always-on / local dev)
// ---------------------------------------------------------------------------
type FileShape = { kv: Record<string, string>; locks: Record<string, { owner: string; expiresAt: number }> };

class FileBackend implements StorageBackend {
  private file: string;
  private cache: FileShape | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'store.json');
  }

  private async load(): Promise<FileShape> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<FileShape>;
      this.cache = { kv: parsed.kv ?? {}, locks: parsed.locks ?? {} };
    } catch {
      this.cache = { kv: {}, locks: {} };
    }
    return this.cache;
  }

  private async persist(db: FileShape) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tmp, this.file);
  }

  private mutate<T>(fn: (db: FileShape) => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const db = await this.load();
      const res = await fn(db);
      await this.persist(db);
      return res;
    };
    const p = this.chain.then(run, run);
    this.chain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  async getRaw(key: string) {
    const db = await this.load();
    return db.kv[key] ?? null;
  }
  async setRaw(key: string, value: string) {
    await this.mutate((db) => {
      db.kv[key] = value;
    });
  }
  async del(key: string) {
    await this.mutate((db) => {
      delete db.kv[key];
    });
  }
  async keys(prefix: string) {
    const db = await this.load();
    return Object.keys(db.kv).filter((k) => k.startsWith(prefix));
  }
  async acquireLock(key: string, ttlMs: number) {
    return this.mutate((db) => {
      const now = Date.now();
      const cur = db.locks[key];
      if (cur && cur.expiresAt > now) return null;
      const owner = randomUUID();
      db.locks[key] = { owner, expiresAt: now + ttlMs };
      return owner;
    });
  }
  async releaseLock(key: string, owner: string) {
    await this.mutate((db) => {
      const cur = db.locks[key];
      if (cur && cur.owner === owner) delete db.locks[key];
    });
  }
}

// ---------------------------------------------------------------------------
// Vercel KV (Upstash Redis) — serverless
// ---------------------------------------------------------------------------
class KvBackend implements StorageBackend {
  // lazily loaded @vercel/kv client
  private clientPromise: Promise<{
    get: (k: string) => Promise<unknown>;
    set: (k: string, v: string, opts?: Record<string, unknown>) => Promise<unknown>;
    del: (k: string) => Promise<unknown>;
    keys: (pattern: string) => Promise<string[]>;
  }> | null = null;

  private client() {
    if (!this.clientPromise) {
      // dynamic import so the dep is only required on Vercel
      this.clientPromise = import('@vercel/kv').then((m) => m.kv as never);
    }
    return this.clientPromise;
  }

  async getRaw(key: string) {
    const kv = await this.client();
    const v = await kv.get(key);
    return v == null ? null : typeof v === 'string' ? v : JSON.stringify(v);
  }
  async setRaw(key: string, value: string) {
    const kv = await this.client();
    await kv.set(key, value);
  }
  async del(key: string) {
    const kv = await this.client();
    await kv.del(key);
  }
  async keys(prefix: string) {
    const kv = await this.client();
    return kv.keys(`${prefix}*`);
  }
  async acquireLock(key: string, ttlMs: number) {
    const kv = await this.client();
    const owner = randomUUID();
    const res = await kv.set(`lock:${key}`, owner, { nx: true, px: ttlMs });
    return res === 'OK' || res === true ? owner : null;
  }
  async releaseLock(key: string, owner: string) {
    const kv = await this.client();
    const cur = await kv.get(`lock:${key}`);
    if (cur === owner) await kv.del(`lock:${key}`);
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
function pickBackend(): StorageBackend {
  if (process.env.VITEST) return new MemoryBackend();
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return new KvBackend();
  const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
  return new FileBackend(dataDir);
}

let backend: StorageBackend | null = null;
export function storage(): StorageBackend {
  if (!backend) backend = pickBackend();
  return backend;
}

/** Test/helper: force a fresh backend (e.g. after changing env). */
export function __resetBackendForTests(): void {
  backend = null;
}

export const backendKind = (): 'memory' | 'kv' | 'file' =>
  process.env.VITEST ? 'memory' : process.env.KV_REST_API_URL ? 'kv' : 'file';

/** Record a dashboard timestamp/marker (best-effort; never throws). */
export async function setMeta(key: string, value: string): Promise<void> {
  try {
    await storage().setRaw(`meta:${key}`, value);
  } catch {
    /* best-effort */
  }
}
