import { defineConfig } from '@playwright/test';

/**
 * Сквозные тесты идут против запущенного стенда (./stand/stand.sh up, режим Demo; состояние — в памяти процесса).
 *   E2E_BASE_URL  — адрес стенда (по умолчанию http://localhost:5080)
 *   E2E_USER      — пользователь (по умолчанию demo-operator)
 *   E2E_PASSWORD  — пароль стенда (обязателен; печатается stand.sh и лежит в stand/.run/credentials)
 *   PW_CHROMIUM_PATH — путь к уже установленному Chromium, если он не из `playwright install`
 */
export default defineConfig({
  testDir: './specs',
  workers: 1, // один стенд с общим состоянием в памяти — тесты идут по очереди
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5080',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});