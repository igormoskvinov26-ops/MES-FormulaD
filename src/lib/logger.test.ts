import { describe, expect, it } from 'vitest';
import { redact } from './logger.js';

describe('logger redaction (spec §27, §34)', () => {
  it('redacts sensitive keys', () => {
    const out = redact({
      token: 'abc123',
      TELEGRAM_BOT_TOKEN: 'bot999:secret',
      Authorization: 'Bearer xyz',
      apiKey: 'k',
      nested: { password: 'p', ok: 'visible' },
      ok: 'visible',
    }) as Record<string, unknown>;
    expect(out.token).toBe('[redacted]');
    expect(out.TELEGRAM_BOT_TOKEN).toBe('[redacted]');
    expect(out.Authorization).toBe('[redacted]');
    expect(out.apiKey).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).password).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).ok).toBe('visible');
    expect(out.ok).toBe('visible');
  });

  it('masks token-shaped substrings in free strings', () => {
    const s = redact('call with Bearer aaaa.bbbb.cccc header') as string;
    expect(s).toContain('Bearer [redacted]');
    expect(s).not.toContain('aaaa.bbbb.cccc');
    const bot = redact('url https://api.telegram.org/bot123456:AAABBBccc/send') as string;
    expect(bot).toContain('bot[redacted]');
  });
});
