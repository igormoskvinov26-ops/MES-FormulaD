import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Minimal persistent key-value store backed by a JSON file with atomic writes.
 *
 * Single-instance job locking and Story state live here. For a multi-instance
 * deployment, swap this for Redis/Postgres — the lock/state interfaces are kept
 * narrow so that substitution is localized.
 */
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

type DbShape = {
  locks: Record<string, { acquiredAt: number; expiresAt: number; owner: string }>;
  stories: Record<string, unknown>;
  meta: Record<string, unknown>;
};

const empty: DbShape = { locks: {}, stories: {}, meta: {} };

let cache: DbShape | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function load(): Promise<DbShape> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    cache = { ...empty, ...parsed, locks: parsed.locks ?? {}, stories: parsed.stories ?? {}, meta: parsed.meta ?? {} };
  } catch {
    cache = structuredClone(empty);
  }
  return cache;
}

async function persist(db: DbShape): Promise<void> {
  await ensureDir();
  const tmp = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, DB_FILE);
}

/** Serialize a read-modify-write against the store. */
export async function mutate<T>(fn: (db: DbShape) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  };
  const p = writeChain.then(run, run);
  // keep the chain going regardless of individual failures
  writeChain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

export async function read<T>(fn: (db: DbShape) => T): Promise<T> {
  const db = await load();
  return fn(db);
}

/** Test helper — reset in-memory cache (does not delete the file). */
export function __resetCacheForTests() {
  cache = null;
}
