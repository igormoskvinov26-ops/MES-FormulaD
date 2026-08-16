import { mutate, read } from '../../store/db.js';

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

function key(staffId: number, date: string): string {
  return `${date}:${staffId}`;
}

export async function getStoryState(staffId: number, date: string): Promise<StoryState | null> {
  return read((db) => (db.stories[key(staffId, date)] as StoryState | undefined) ?? null);
}

export async function saveStoryState(state: StoryState): Promise<void> {
  await mutate((db) => {
    db.stories[key(state.staffId, state.date)] = state;
  });
}

export async function listStoryStates(date: string): Promise<StoryState[]> {
  return read((db) =>
    Object.values(db.stories)
      .map((s) => s as StoryState)
      .filter((s) => s.date === date),
  );
}
