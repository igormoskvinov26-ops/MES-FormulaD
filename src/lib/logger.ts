import { formatMsk } from './time.js';

/**
 * Structured logger with secret redaction.
 *
 * Secrets (bot token, YCLIENTS tokens, Authorization headers, etc.) must never
 * reach logs. `redact()` scrubs known-sensitive keys and token-shaped values.
 */

const SENSITIVE_KEY_RE =
  /(token|secret|password|authorization|auth|api[_-]?key|bearer|credential)/i;

/** Recursively redact sensitive fields from an arbitrary value. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

/** Mask bearer/token-looking substrings inside free strings. */
function redactString(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .replace(/bot\d{6,}:[A-Za-z0-9_\-]+/g, 'bot[redacted]');
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** A single structured log line as required by the spec. */
export type ActionLog = {
  timestamp?: string;
  job?: string;
  master?: string;
  sourceData?: unknown;
  result?: string;
  telegramDestination?: string;
  telegramMessageId?: string | number;
  telegramStoryId?: string | number;
  error?: string;
  [key: string]: unknown;
};

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    ts: formatMsk(),
    msg,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),

  /** Emit an action-journal line for an automated job. */
  action: (entry: ActionLog) => {
    emit('info', 'action', { ...entry, timestamp: entry.timestamp ?? formatMsk() });
  },
};
