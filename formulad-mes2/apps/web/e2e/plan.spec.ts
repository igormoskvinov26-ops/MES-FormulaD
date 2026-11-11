import { test, expect } from '@playwright/test';
import { login } from './auth';

// ponytail: plan screen needs SQL for data — test only the chrome (search, tiles, table element)
test.beforeEach(async ({ page }) => {
  await login(page);
});

test('plan screen renders table element', async ({ page }) => {
  await expect(page.locator('table')).toBeVisible({ timeout: 5_000 });
});

test('search field is present', async ({ page }) => {
  await expect(page.locator('.search')).toBeVisible();
});

test('stat tiles are visible', async ({ page }) => {
  await expect(page.locator('.stat-tile').first()).toBeVisible();
});
