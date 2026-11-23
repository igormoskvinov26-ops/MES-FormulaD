import { expect, test } from '@playwright/test';
import { login, openScreen, scan } from './helpers';

test('Rework: скан изделия в Rework и завершение', async ({ page }) => {
  await login(page);

  // нужно изделие в статусе Rework — берём счётчик из плашки
  const tile = page.getByRole('button', { name: 'Фильтр: Rework' });
  await expect(tile.locator('strong')).toBeVisible();
  const count = Number(await tile.locator('strong').innerText());
  test.skip(count === 0, 'Нет изделий в статусе Rework — перезапустите стенд');

  await tile.click();
  await expect(page.locator('tbody tr')).toHaveCount(count);
  const vin = (await page.locator('tbody tr').first().locator('td.vin').innerText()).trim();

  await openScreen(page, 'Rework');
  await scan(page, vin);
  await expect(page.getByLabel(`Найдено изделие ${vin}`)).toBeVisible();
  await page.getByRole('button', { name: 'Завершить Rework' }).click();
  await page.locator('.f7mes__modal').getByRole('button', { name: 'Завершить Rework' }).click();
  await expect(page.getByRole('status').first()).toContainText(`Готово: ${vin}`);
});

test('Rework: скан несуществующего VIN даёт ошибку', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Rework');
  await scan(page, 'NO-SUCH-VIN-REWORK');
  await expect(page.getByRole('status').first()).toContainText(/не найден|Не найден/);
});