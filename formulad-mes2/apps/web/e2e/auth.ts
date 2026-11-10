import { type Page, expect } from '@playwright/test';

export async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Пользователь').fill('admin');
  await page.getByLabel('Пароль').fill('F7mes');
  await page.getByRole('button', { name: 'Войти' }).click();
  // ponytail: wait for topbar-user — doesn't need SQL, unlike the plan table
  await expect(page.locator('.topbar-user')).toBeVisible({ timeout: 10_000 });
}
