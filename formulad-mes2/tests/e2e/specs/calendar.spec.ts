import { expect, test } from '@playwright/test';
import { login, openScreen } from './helpers';

test('календарь: неделя с прогнозом, переключение недель и возврат на «Сегодня»', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Календарь');

  const week = page.getByRole('main', { name: 'Неделя' });
  await expect(week).toBeVisible();
  await expect(week.getByRole('region')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Неделя', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'День', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // изделия плана раскладываются по неделям; перелистываем вперёд, пока не найдём карточки, но не бесконечно
  const cards = page.getByRole('article');
  const range = page.locator('.cal__range');
  const first = await range.innerText();
  let found = (await cards.count()) > 0;
  for (let i = 0; i < 4 && !found; i++) {
    await page.getByRole('button', { name: 'Следующая неделя' }).click();
    found = (await cards.count()) > 0;
  }
  expect(found).toBe(true);
  await expect(cards.first()).toContainText(/DEMO-VIN|E2E-VIN/);

  await page.getByRole('button', { name: 'Сегодня' }).click();
  await expect(range).toHaveText(first);
});

test('календарь: праздник в шапке дня запоминается, «Пересчитать план» применяет его, сброс возвращает график', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Календарь');
  const day = page.locator('.cal__day[data-working="true"]').first();
  const label = await day.getByRole('button', { name: /^Настроить день/ }).getAttribute('aria-label');
  expect(label).toBeTruthy();

  await page.getByRole('button', { name: label! }).click();
  const dialog = page.getByRole('dialog', { name: /Настройка дня/ });
  await dialog.getByLabel('Праздник / выходной').check();
  await dialog.getByRole('button', { name: 'ОК' }).click();
  await expect(page.getByText(/Изменений календаря:/)).toBeVisible();
  await page.getByRole('button', { name: 'Пересчитать план' }).click();
  await expect(page.getByText('План пересчитан по новому графику.')).toBeVisible();
  await expect(page.locator('.cal__day[data-working="false"]').filter({ hasText: 'выходной' }).first()).toBeVisible();

  // возвращаем стенд к стандартному графику: снимаем галочку и пересчитываем
  await page.getByRole('button', { name: label! }).click();
  await page.getByRole('dialog', { name: /Настройка дня/ }).getByLabel('Праздник / выходной').uncheck();
  await page.getByRole('dialog', { name: /Настройка дня/ }).getByRole('button', { name: 'ОК' }).click();
  await page.getByRole('button', { name: 'Пересчитать план' }).click();
  await expect(page.getByText('План пересчитан по новому графику.')).toBeVisible();
});

test('администрирование: загрузка календаря из вставки и удаление отметки', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Администрирование');
  await page.getByRole('button', { name: 'Производственный календарь' }).click();

  await page.getByLabel('Вставка календаря из Excel').fill('Дата\tТип\tС\tПо\tПримечание\n31.12.2027\tПраздник\t\t\tE2E-день');
  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByText('Строк: 1 · Ошибок: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Загрузить в календарь' }).click();
  await expect(page.getByText('Загружено дней: 1.')).toBeVisible();

  const list = page.getByLabel('Отметки календаря');
  await expect(list.getByText('E2E-день')).toBeVisible();
  await list.getByRole('button', { name: 'Удалить отметку 31.12.2027' }).click();
  await expect(list.getByText('E2E-день')).toBeHidden();
});

test('календарь: ракурсы «День» и «Месяц», переход из месяца в день, окно «Прогресс сборки»', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Календарь');

  await page.getByRole('button', { name: 'День', exact: true }).click();
  await expect(page.getByRole('main', { name: 'День' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Часы дня' })).toBeVisible();

  await page.getByRole('button', { name: 'Месяц', exact: true }).click();
  const month = page.getByRole('main', { name: 'Месяц' });
  await expect(month).toBeVisible();
  expect(await month.getByRole('button').count()).toBeGreaterThanOrEqual(28);
  await month.getByRole('button').nth(10).click(); // клик по клетке открывает день
  await expect(page.getByRole('main', { name: 'День' })).toBeVisible();

  // «Прогресс сборки»: на неделе, где есть изделия
  await page.getByRole('button', { name: 'Неделя', exact: true }).click();
  await page.getByRole('button', { name: 'Сегодня' }).click();
  const cards = page.getByRole('article');
  for (let i = 0; i < 4 && (await cards.count()) === 0; i++) await page.getByRole('button', { name: 'Следующая неделя' }).click();
  await cards.first().click();
  const dialog = page.getByRole('dialog', { name: /^Прогресс сборки / });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Линия станций').getByRole('listitem')).toHaveCount(11);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('календарь: перетаскивание карточки меняет порядок плана после подтверждения, «Отменить перенос» возвращает', async ({ page }) => {
  await login(page);
  await openScreen(page, 'Календарь');

  // неделя, где есть хотя бы два запланированных изделия с позицией в плане (их можно двигать)
  const movable = page.locator('.cal__card[data-movable="true"]');
  for (let i = 0; i < 4 && (await movable.count()) < 2; i++) await page.getByRole('button', { name: 'Следующая неделя' }).click();
  expect(await movable.count()).toBeGreaterThanOrEqual(2);
  const vins = async () => (await movable.locator('.cal__vin').allInnerTexts()).map((s) => s.trim());
  const before = await vins();

  // последнюю движимую карточку бросаем на первую → встанет перед ней
  await movable.last().dragTo(movable.first());
  const dialog = page.getByRole('dialog', { name: /^Перенос изделия / });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Меняется порядок запуска в плане');
  expect(await vins()).toEqual(before); // до подтверждения ничего не изменилось
  await dialog.getByRole('button', { name: 'Перенести' }).click();
  await expect(page.getByText(/перенесено/)).toBeVisible();
  const after = await vins();
  expect(after[0]).toBe(before[before.length - 1]);

  await page.getByRole('button', { name: 'Отменить перенос' }).click();
  await expect(page.getByText(/Перенос изделия .* отменён/)).toBeVisible();
  expect(await vins()).toEqual(before);
});

test('администрирование: изменение производительности меняет прогноз в календаре, возврат восстанавливает', async ({ page }) => {
  await login(page);

  const setPerShift = async (value: number) => {
    await openScreen(page, 'Администрирование');
    await page.getByRole('button', { name: 'Производственный календарь' }).click();
    const form = page.getByLabel('График работы');
    await form.getByLabel('Изделий в смену').fill(String(value));
    await form.getByRole('button', { name: 'Сохранить график' }).click();
    await expect(page.getByText(/График работы сохранён/)).toBeVisible();
  };

  await setPerShift(4);
  try {
    await openScreen(page, 'Календарь');
    await expect(page.getByText(/4 изделий в смену/)).toBeVisible();
    await expect(page.locator('.cal__load').filter({ hasText: /из 4$/ }).first()).toBeVisible();
  } finally {
    await setPerShift(8);
  }
  await openScreen(page, 'Календарь');
  await expect(page.getByText(/8 изделий в смену/)).toBeVisible();
});


test('посты контроля качества: заданные в администрировании, видны на линии станций в окне «Прогресс сборки»', async ({ page }) => {
  await login(page);
  const openPosts = async () => {
    await openScreen(page, 'Администрирование');
    await page.getByRole('button', { name: 'Производственный календарь' }).click();
    return page.getByLabel('График работы');
  };

  let form = await openPosts();
  await form.getByRole('button', { name: 'Добавить пост контроля' }).click();
  await form.getByLabel('Название').fill('Пост E2E');
  await form.getByLabel('Стоит после станции').selectOption('3');
  await form.getByRole('button', { name: 'Сохранить график' }).click();
  await expect(page.getByText(/График работы сохранён/)).toBeVisible();

  try {
    await openScreen(page, 'Календарь');
    const cards = page.getByRole('article');
    for (let i = 0; i < 4 && (await cards.count()) === 0; i++) await page.getByRole('button', { name: 'Следующая неделя' }).click();
    await cards.first().click();
    const line = page.getByRole('dialog', { name: /^Прогресс сборки / }).getByLabel('Линия станций');
    await expect(line.getByLabel('Пост контроля качества: Пост E2E')).toBeVisible();
    await expect(line.getByRole('listitem')).toHaveCount(12); // 11 станций + пост
    await page.keyboard.press('Escape');
  } finally {
    form = await openPosts();
    await form.getByRole('button', { name: 'Удалить пост контроля 1' }).click();
    await form.getByRole('button', { name: 'Сохранить график' }).click();
    await expect(page.getByText(/График работы сохранён/)).toBeVisible();
  }
});