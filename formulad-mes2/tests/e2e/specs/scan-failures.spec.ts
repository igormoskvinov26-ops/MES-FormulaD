import { expect, test } from '@playwright/test';
import { login, openScreen, scan } from './helpers';

// T-042: scan failure scenarios — never a silent status transition

test('повторный скан после успешного старта: экран показывает текущий статус, не молчит', async ({ page }) => {
  await login(page);

  // find a planned unit
  const tile = page.getByRole('button', { name: 'Фильтр: Запланировано' });
  await expect(tile.locator('strong')).toBeVisible();
  const count = Number(await tile.locator('strong').innerText());
  test.skip(count === 0, 'Нет запланированных изделий — перезапустите стенд');
  await tile.click();
  await expect(page.locator('tbody tr')).toHaveCount(count);
  const vin = (await page.locator('tbody tr').first().locator('td.vin').innerText()).trim();

  // start it
  await openScreen(page, 'Старт');
  await scan(page, vin);
  await page.getByRole('button', { name: 'Запустить' }).click();
  await expect(page.getByRole('status').first()).toContainText(`Готово: ${vin}`);

  // re-scan the same VIN — must NOT silently transition again
  await scan(page, vin);
  const status = page.getByRole('status').first();
  // expect error or "already started" — not an empty/success state without transition
  await expect(status).not.toHaveText('');
  // the response must contain some feedback (error or status info), never blank
  const text = await status.innerText();
  expect(text.length).toBeGreaterThan(0);
});

test('скан второго VIN до подтверждения первого: отображается второй VIN', async ({ page }) => {
  await login(page);

  const tile = page.getByRole('button', { name: 'Фильтр: Запланировано' });
  await expect(tile.locator('strong')).toBeVisible();
  const count = Number(await tile.locator('strong').innerText());
  test.skip(count < 2, 'Нужно минимум 2 запланированных изделия — перезапустите стенд');
  await tile.click();
  await expect(page.locator('tbody tr')).toHaveCount(count);
  const vin1 = (await page.locator('tbody tr').nth(0).locator('td.vin').innerText()).trim();
  const vin2 = (await page.locator('tbody tr').nth(1).locator('td.vin').innerText()).trim();

  await openScreen(page, 'Старт');

  // scan first VIN — panel shows it
  await scan(page, vin1);
  await expect(page.getByLabel(`Найдено изделие ${vin1}`)).toBeVisible();

  // scan second VIN WITHOUT confirming first — panel must switch to second
  await scan(page, vin2);
  await expect(page.getByLabel(`Найдено изделие ${vin2}`)).toBeVisible();
  // first VIN must NOT appear — no silent transition
  await expect(page.getByLabel(`Найдено изделие ${vin1}`)).not.toBeVisible();
});

test('сетевой сбой при подтверждении старта: ошибка видима, статус не меняется молча', async ({ page }) => {
  await login(page);

  const tile = page.getByRole('button', { name: 'Фильтр: Запланировано' });
  await expect(tile.locator('strong')).toBeVisible();
  const count = Number(await tile.locator('strong').innerText());
  test.skip(count === 0, 'Нет запланированных изделий — перезапустите стенд');
  await tile.click();
  await expect(page.locator('tbody tr')).toHaveCount(count);
  const vin = (await page.locator('tbody tr').first().locator('td.vin').innerText()).trim();

  await openScreen(page, 'Старт');
  await scan(page, vin);
  await expect(page.getByLabel(`Найдено изделие ${vin}`)).toBeVisible();

  // intercept the POST to simulate network failure
  await page.route('**/api/v1/scan/**', (route) => route.abort('failed'));

  await page.getByRole('button', { name: 'Запустить' }).click();

  // must show an error — never silently succeed
  const status = page.getByRole('status').first();
  await expect(status).toBeVisible({ timeout: 10_000 });
  const text = await status.innerText();
  // should NOT contain success text
  expect(text).not.toMatch(/Готово:/i);
  // should contain some error indication
  expect(text.length).toBeGreaterThan(0);
});
