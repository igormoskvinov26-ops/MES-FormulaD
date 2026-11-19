import { expect, test } from '@playwright/test';
import { login, openScreen } from './helpers';

test('станции: «Проверено всё» отмечает компоненты станции, «Снять проверку» снимает отметки', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Станции');
  await page.getByLabel('VIN изделия').fill('DEMO-VIN-00005');
  await page.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByLabel('Станции')).toBeVisible();

  // в демо-данных компоненты есть у станций 3, 5, 6, 7, 9, 11 — берём станцию 3 (два компонента)
  await page.getByRole('button', { name: /^Станция 3 — / }).click();
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(2);

  await page.getByRole('button', { name: 'Проверено всё' }).click();
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).toBeChecked();

  await page.getByRole('button', { name: 'Снять проверку' }).click();
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
});
