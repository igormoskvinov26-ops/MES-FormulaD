import { test, expect } from '@playwright/test';

test('shows login screen on first visit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Вход в систему' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
});

test('rejects wrong credentials', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Пользователь').fill('wrong');
  await page.getByLabel('Пароль').fill('wrong');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
});

test('logs in and shows production plan', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Пользователь').fill('admin');
  await page.getByLabel('Пароль').fill('F7mes');
  await page.getByRole('button', { name: 'Войти' }).click();
  // ponytail: topbar-user proves login succeeded without needing SQL data
  await expect(page.locator('.topbar-user')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.topbar-user')).toContainText('admin');
});
