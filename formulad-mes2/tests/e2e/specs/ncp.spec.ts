import { expect, test } from '@playwright/test';
import { login, openScreen } from './helpers';

test('NCP: список и карточка заявки с моделью и цветом изделия', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Несоответствия');
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  const card = page.getByLabel(/Несоответствие NC-/);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Модель');
  await expect(card).toContainText('Цвет');
});

test('NCP: регистрация несоответствия появляется в списке как открытое', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Несоответствия');
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();

  await page.getByRole('button', { name: 'Зарегистрировать несоответствие' }).click();
  const dialog = page.getByRole('dialog', { name: 'Регистрация несоответствия' });
  await dialog.getByLabel('VIN').fill('DEMO-VIN-00001');
  await dialog.getByLabel('Комментарий оператора').fill('E2E: проверка регистрации');
  await dialog.getByRole('button', { name: 'Зарегистрировать', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(rows).toHaveCount(before + 1);
  await expect(rows.first()).toContainText('DEMO-VIN-00001');
  await expect(rows.first()).toContainText(/Открыто/);
});

test('NCP: закрытие заявки меняет статус на Закрыто', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Несоответствия');
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();

  // берём первое открытое несоответствие
  const openRow = rows.filter({ hasText: /Открыто/ }).first();
  await expect(openRow).toBeVisible();
  await openRow.click();

  const card = page.getByLabel(/Несоответствие NC-/);
  await expect(card).toBeVisible();
  await card.getByLabel('Комментарий инженера').fill('E2E: закрытие заявки');
  await card.getByRole('button', { name: 'Закрыть заявку' }).click();

  // после закрытия кнопка меняет текст
  await expect(card.getByRole('button', { name: 'Заявка закрыта' })).toBeVisible();
});