import { test, expect } from '@playwright/test';
import { login } from './auth';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('Ctrl+K opens command palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Палитра команд' })).toBeVisible();
});

test('command palette navigates to screen', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByLabel('Поиск раздела').fill('нес');
  // "Несоответствия" should appear
  await expect(page.getByRole('option', { name: /Несоответствия/ })).toBeVisible();
  await page.keyboard.press('Enter');
  // Palette closes, NCP screen active
  await expect(page.getByRole('dialog', { name: 'Палитра команд' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Несоответствия' })).toHaveAttribute('aria-current', 'page');
});

test('Escape closes command palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Палитра команд' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Палитра команд' })).not.toBeVisible();
});
