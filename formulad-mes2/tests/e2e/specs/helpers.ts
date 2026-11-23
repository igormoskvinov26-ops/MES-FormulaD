import { expect, type Page } from '@playwright/test';

export async function login(page: Page) {
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error('Задайте E2E_PASSWORD (пароль стенда, см. stand/.run/credentials)');
  await page.goto('/');
  await page.locator('input').first().fill(process.env.E2E_USER ?? 'demo-operator');
  await page.locator('input[type=password]').fill(password);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Производственный план/i }).first()).toBeVisible();
}

export async function openScreen(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
}

/** Ввод VIN в поле скана активного экрана и Enter. */
export async function scan(page: Page, vin: string) {
  const field = page.getByLabel('Сканирование VIN');
  await field.fill(vin);
  await field.press('Enter');
}