import { expect, test } from '@playwright/test';
import { login, openScreen, scan } from './helpers';

test('цепочка: старт → завершение → FOK для запланированного изделия', async ({ page }) => {
  await login(page);

  // берём первое запланированное изделие из плана (состояние стенда общее и меняется по ходу тестов)
  const tile = page.getByRole('button', { name: 'Фильтр: Запланировано' });
  await expect(tile.locator('strong')).toHaveText(/^\d+$/); // счётчики плашек загружены
  const planned = Number(await tile.locator('strong').innerText());
  test.skip(planned === 0, 'На стенде не осталось запланированных изделий — перезапустите стенд (stand.sh down && up)');
  await tile.click();
  await expect(page.locator('tbody tr')).toHaveCount(planned); // дождались перезагрузки списка
  const vin = (await page.locator('tbody tr').first().locator('td.vin').innerText()).trim();
  expect(vin.length).toBeGreaterThan(3); // на стенде после прошлых прогонов первым может быть изделие из импорта

  await openScreen(page, 'Старт');
  await scan(page, vin);
  await expect(page.getByLabel(`Найдено изделие ${vin}`)).toBeVisible();
  await page.getByRole('button', { name: 'Запустить' }).click();
  await expect(page.getByRole('status').first()).toContainText(`Готово: ${vin}`);

  await openScreen(page, 'Завершение');
  await scan(page, vin);
  await expect(page.getByLabel(`Найдено изделие ${vin}`)).toBeVisible();
  await page.getByRole('button', { name: 'Завершить' }).click();
  await expect(page.getByRole('status').first()).toContainText(`Готово: ${vin}`);

  await openScreen(page, 'FOK');
  await scan(page, vin);
  await expect(page.getByRole('status').first()).toContainText(/готово к подтверждению/i);
  await page.getByRole('button', { name: /Подтвердить FOK/ }).click(); // открывает окно подтверждения
  await page.locator('.f7mes__modal').getByRole('button', { name: /Подтвердить FOK/ }).click();
  await expect(page.getByRole('status').first()).toContainText(`Готово: ${vin}`);

  // в плане изделие теперь «ФОК пройден»
  await openScreen(page, 'Производственный план');
  await page.getByPlaceholder(/Поиск VIN/).fill(vin);
  await expect(page.locator('tbody tr')).toHaveCount(1); // дождались перезагрузки по поиску
  await expect(page.locator('tbody tr').first()).toContainText(/ФОК пройден/i);
});

test('скан несуществующего VIN даёт отказ, а не молчание', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Старт');
  await scan(page, 'NO-SUCH-VIN-999');
  await expect(page.getByRole('status').first()).toContainText(/не найден|Не найден/);
});