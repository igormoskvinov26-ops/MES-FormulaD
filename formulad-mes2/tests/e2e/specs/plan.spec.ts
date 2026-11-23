import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.beforeEach(async ({ page }) => { await login(page); });

test('план: загрузка, фильтр по клику на плашку и снятие фильтра', async ({ page }) => {
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(3);

  // выпадающего списка статуса больше нет — фильтр только по плашкам
  await expect(page.getByLabel('Статус', { exact: true })).toHaveCount(0);

  const tile = page.getByRole('button', { name: 'Фильтр: Запланировано' });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).not.toHaveCount(total); // данные перезагружаются после клика
  expect(await rows.count()).toBeLessThan(total);

  await page.getByRole('button', { name: 'Показать все' }).click();
  await expect(rows).toHaveCount(total);
});

test('план: поиск по последним цифрам VIN и карточка с картинкой', async ({ page }) => {
  await page.getByPlaceholder(/Поиск VIN/).fill('00002');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody tr').first().click();
  await expect(page.getByLabel(/Карточка изделия DEMO-VIN-00002/)).toBeVisible();
  await expect(page.locator('.product-card__atv')).toBeVisible();
});