import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('Печать JobCard: выбор изделия и открытие диалога', async ({ page }) => {
  await login(page);
  // должно быть хотя бы одно изделие в плане
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const vin = (await page.locator('tbody tr').first().locator('td.vin').innerText()).trim();

  await page.getByLabel(`Выбрать ${vin} для печати`).check();
  await expect(page.getByRole('button', { name: /Печать выбранных/ })).toBeEnabled();
  await page.getByRole('button', { name: /Печать выбранных/ }).click();

  const dialog = page.getByRole('dialog', { name: new RegExp(`JobCard ${vin}`) });
  await expect(dialog).toBeVisible();
  // закрыть диалог
  await dialog.getByRole('button', { name: /закрыть|close/i }).first().click();
  await expect(dialog).toBeHidden();
});
