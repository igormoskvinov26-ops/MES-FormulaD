import { expect, test } from '@playwright/test';
import { login, openScreen } from './helpers';

const HEADER = ['VIN', 'Артикул модели', '№ двигателя', 'Цвет', 'Комплектация', 'Дата старта', 'Дата завершения', 'Дата отгрузки'].join('\t');

test('импорт: вставка из Excel → проверка → публикация добавляет изделие в конец плана', async ({ page }) => {
  await login(page);
  const vin = `E2E-VIN-${Date.now().toString().slice(-8)}`;

  await openScreen(page, 'Импорт плана');
  // столбцы: VIN, артикул модели, № двигателя, цвет, комплектация, даты старта/завершения/отгрузки
  const row = [vin, 'DEMO-800', `E2E-ENG-${vin.slice(-4)}`, 'Красный', 'Pathcross 1000 LTD · ДЕМО', '01.12.2026', '02.12.2026', '03.12.2026'].join('\t');
  await page.getByLabel('Вставка диапазона из Excel').fill(`${HEADER}\n${row}`);
  await page.getByRole('button', { name: 'Проверить' }).click();

  await expect(page.getByText(/Строк: 1 · Ошибок: 0/)).toBeVisible();
  await expect(page.getByText('Можно публиковать')).toBeVisible();
  await page.getByRole('button', { name: 'Загрузить производственный план' }).click();

  await openScreen(page, 'Производственный план');
  await page.getByPlaceholder(/Поиск VIN/).fill(vin);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText(vin);
});

test('импорт: ошибка в строке показывается и блокирует публикацию', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Импорт плана');
  await page.getByLabel('Вставка диапазона из Excel').fill(`${HEADER}\n` + ['E2E-BAD-1', 'NO-SUCH-MODEL', 'E2E-ENG-X', 'Красный', 'Pathcross 1000 LTD · ДЕМО', '', '', ''].join('\t'));
  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByText(/Ошибок: [1-9]/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Загрузить производственный план' })).toBeDisabled();
});
