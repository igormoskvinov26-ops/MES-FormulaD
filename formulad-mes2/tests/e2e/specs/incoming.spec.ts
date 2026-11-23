import { expect, test } from '@playwright/test';
import { login, openScreen } from './helpers';

test('Входной контроль: экран загружается и показывает список поставок', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Входной контроль');
  await expect(page.getByRole('heading', { name: 'ВХОДНОЙ КОНТРОЛЬ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Новая поставка' })).toBeVisible();
});

test('Входной контроль: создание новой поставки', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Входной контроль');
  await page.getByRole('button', { name: 'Новая поставка' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toBeHidden();
});