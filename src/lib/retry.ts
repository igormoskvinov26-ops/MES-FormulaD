import { logger } from './logger.js';

/**
 * Bounded retry with backoff. External API errors must NOT cascade into mass
 * re-publication — callers combine this with idempotency checks before any
 * Telegram publish.
 */
export type RetryOptions = {
  /** Number of retries (in addition to the first attempt). Default 1. */
  retries?: number;
  /** Backoff delays in ms per retry. Default [5000, 30000]. */
  delaysMs?: number[];
  /** Label for logs. */
  label?: string;
  /** Predicate to decide whether an error is retryable. Default: always. */
  retryable?: (err: unknown) => boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 1;
  const delays = opts.delaysMs ?? [5000, 30000];
  const label = opts.label ?? 'op';
  const retryable = opts.retryable ?? (() => true);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !retryable(err)) break;
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 5000;
      logger.warn('retrying after error', {
        label,
        attempt: attempt + 1,
        nextDelayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
    }
  }
  throw lastErr;
}
