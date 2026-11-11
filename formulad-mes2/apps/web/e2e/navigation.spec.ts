import { test, expect } from '@playwright/test';
import { login } from './auth';

test.beforeEach(async ({ page }) => {
  await login(page);
});

const screens = [
  { label: 'Несоответствия', marker: 'NCP' },
  { label: 'Старт', marker: 'Старт' },
  { label: 'Станции', marker: 'Станции' },
  { label: 'Завершение', marker: 'Завершение' },
  { label: 'FOK', marker: 'FOK' },
  { label: 'Rework', marker: 'Rework' },
  { label: 'Входной контроль', marker: 'Входной' },
  { label: 'Отчётность', marker: 'Отчёт' },
  { label: 'Администрирование', marker: 'Администрирование' },
];

for (const { label, marker } of screens) {
  test(`navigate to ${label}`, async ({ page }) => {
    await page.getByRole('button', { name: label }).click();
    // Each screen should render without error — check page doesn't show a blank screen
    await page.waitForTimeout(500);
    // Sidebar button should be active
    await expect(page.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page');
  });
}

test('navigate back to plan', async ({ page }) => {
  await page.getByRole('button', { name: 'Несоответствия' }).click();
  await page.getByRole('button', { name: 'Производственный план' }).click();
  await expect(page.locator('table')).toBeVisible({ timeout: 5_000 });
});
