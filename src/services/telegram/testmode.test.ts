import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * TEST-mode safety (spec §31). env is parsed once at import, so each test resets
 * modules and sets process.env before dynamically importing the service.
 */
async function loadService(envVars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envVars)) process.env[k] = v;
  const mod = await import('./service.js');
  return mod.telegramService();
}

const TEST_ENV = {
  TELEGRAM_BOT_TOKEN: 'x',
  TELEGRAM_TEST_CHAT_ID: '-100111',
  TELEGRAM_PRODUCTION_CHAT_ID: '-100999',
  TELEGRAM_DRY_RUN: 'true',
};

afterEach(() => {
  delete process.env.TELEGRAM_MODE;
});

describe('TelegramService TEST-mode guard', () => {
  it('in TEST mode, resolveChatId("test") returns the test chat', async () => {
    const svc = await loadService({ ...TEST_ENV, TELEGRAM_MODE: 'test' });
    expect(svc.resolveChatId('test')).toBe('-100111');
  });

  it('in TEST mode, resolveChatId("production") throws the exact spec error', async () => {
    const svc = await loadService({ ...TEST_ENV, TELEGRAM_MODE: 'test' });
    expect(() => svc.resolveChatId('production')).toThrowError(
      'Production publishing disabled in TEST mode.',
    );
  });

  it('in TEST mode, postStory targeting production is blocked before any API call', async () => {
    const svc = await loadService({ ...TEST_ENV, TELEGRAM_MODE: 'test' });
    await expect(
      svc.postStory({ photo: Buffer.from(''), areas: [], target: 'production' }),
    ).rejects.toThrowError('Production publishing disabled in TEST mode.');
  });

  it('in PRODUCTION mode, production destination becomes reachable', async () => {
    const svc = await loadService({ ...TEST_ENV, TELEGRAM_MODE: 'production' });
    expect(svc.resolveChatId('production')).toBe('-100999');
    expect(svc.resolveChatId('test')).toBe('-100111');
  });

  it('sendMessage in dry-run does not send and reports dry_run status', async () => {
    const svc = await loadService({ ...TEST_ENV, TELEGRAM_MODE: 'test' });
    const res = await svc.sendMessage('hello', { target: 'test' });
    expect(res.dryRun).toBe(true);
    expect(res.status).toBe('dry_run');
  });
});
