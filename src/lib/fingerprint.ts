import { createHash } from 'node:crypto';

/**
 * Content fingerprint for anti-spam: staffId + date + slots. If nothing changed
 * since the last published Story, we avoid re-publishing a duplicate.
 */
export function slotFingerprint(input: {
  staffId: number;
  date: string;
  slots: string[];
}): string {
  const normalizedSlots = [...input.slots].map((s) => s.trim()).sort();
  const payload = JSON.stringify({
    staffId: input.staffId,
    date: input.date,
    slots: normalizedSlots,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
