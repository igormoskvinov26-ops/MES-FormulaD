import { storage } from '../../store/backend.js';

/** Persisted Story state (spec §15). */
export type StoryStatus = 'published' | 'updated' | 'skipped' | 'failed' | 'dry_run' | 'deleted';

export type StoryState = {
  staffId: number;
  date: string;
  period: string; // morning | day | evening | manual
  telegramStoryId: number | null;
  publishedAt: string | null;
  slotFingerprint: string;
  slots: string[];
  status: StoryStatus;
  error?: string;
};

const PREFIX = 'story:';
function key(staffId: number, date: string): string {
  return `${PREFIX}${date}:${staffId}`;
}

export async function getStoryState(staffId: number, date: string): Promise<StoryState | null> {
  const raw = await storage().getRaw(key(staffId, date));
  return raw ? (JSON.parse(raw) as StoryState) : null;
}

export async function saveStoryState(state: StoryState): Promise<void> {
  await storage().setRaw(key(state.staffId, state.date), JSON.stringify(state));
}

export async function listStoryStates(date: string): Promise<StoryState[]> {
  const keys = await storage().keys(`${PREFIX}${date}:`);
  const out: StoryState[] = [];
  for (const k of keys) {
    const raw = await storage().getRaw(k);
    if (raw) out.push(JSON.parse(raw) as StoryState);
  }
  return out;
}
