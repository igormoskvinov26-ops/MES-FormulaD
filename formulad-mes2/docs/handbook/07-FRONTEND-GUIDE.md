# 07. Руководство по фронтенду

| | |
|---|---|
| **Назначение** | Объяснить, как устроен веб-клиент FormulaD MES (React + TypeScript): структура, данные, экраны, тесты, рецепты доработок. |
| **Для кого** | Веб-разработчик, который впервые открыл `apps/web` и должен за час начать вносить изменения. |
| **Проверено по коммиту** | `fc6f055` (ветка `claude/new-session-bizv59`); последний полный прогон vitest — 52 теста в 12 файлах, все зелёные. |
| **Соседний документ** | [08-UI-DESIGN-SYSTEM.md](08-UI-DESIGN-SYSTEM.md) — токены, CSS-архитектура, каталог компонентов, UX-долг. |

Всё ниже сверено с кодом в [`apps/web/src`](../../apps/web/src). Если что-то не подтверждено кодом, это помечено явно.

## Оглавление

1. [Стек и команды](#1-стек-и-команды)
2. [Структура папок](#2-структура-папок)
3. [Навигация между экранами](#3-навигация-между-экранами-без-роутера)
4. [Слой данных](#4-слой-данных-apits)
5. [Состояние на экранах](#5-состояние-на-экранах)
6. [Карта экранов](#6-карта-экранов)
7. [ScanTransitionScreen](#7-scantransitionscreen--общий-экран-перехода-по-сканеру)
8. [FokScreen](#8-fokscreen--отдельный-экран)
9. [Диалоги](#9-диалоги)
10. [Печать](#10-печать-jobcard-ncp-листы-qr)
11. [Тема и сайдбар](#11-тема-и-сайдбар)
12. [Доступность и aria-контракт](#12-доступность-aria-label-как-контракт-с-тестами)
13. [Тесты](#13-тесты-vitest)
14. [Рецепты](#14-рецепты)
15. [Известные ограничения кода](#15-известные-ограничения-кода)

---

## 1. Стек и команды

Версии зафиксированы точно (без `^`) в [`package.json`](../../apps/web/package.json):

| Что | Версия |
|---|---|
| React / ReactDOM | 18.3.1 |
| TypeScript | 5.6.3 |
| Vite | 5.4.11 (`@vitejs/plugin-react` 4.3.4) |
| Vitest | 2.1.8 + jsdom 25.0.1 |
| Testing Library | react 16.1.0, user-event 14.5.2, jest-dom 6.6.3 |
| qrcode | 1.5.4 (единственная runtime-зависимость кроме React) |

Нет роутера, нет state-менеджера, нет UI-библиотеки, нет CSS-препроцессора: вся стилизация — два обычных `.css` файла.

```bash
cd apps/web
npm ci                 # или npm install
npm run dev            # Vite на http://localhost:5173, /api проксируется на http://localhost:5080
npm run build          # tsc -b && vite build  → папка dist/ (НЕ та, что отдаёт API)
npm run test           # vitest run (один прогон, без watch)
```

**Что отдаёт API.** ASP.NET Core раздаёт статику из `src/FormulaD.Mes.Api/wwwroot` (`app.UseStaticFiles()`, `Program.cs:144`). Папка `wwwroot/` в `.gitignore`, в репозитории её нет. Поэтому для работы «одним процессом» (стенд, демо) UI собирают прямо туда:

```bash
npx vite build --outDir ../../src/FormulaD.Mes.Api/wwwroot --emptyOutDir
```

Именно так делает [`stand/stand.sh`](../../stand/stand.sh). Обычный `npm run build` кладёт результат в `dist/` — API его не видит.

**Dev-прокси** ([`vite.config.ts`](../../apps/web/vite.config.ts)):

```ts
server: {
  port: 5173,
  proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: false } },
},
test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
```

Шрифты (Inter, Rajdhani) подключаются из Google Fonts через `<link>` в [`index.html`](../../apps/web/index.html). Это значит, что на машине без интернета UI откатится на системные шрифты (см. [§15](#15-известные-ограничения-кода)).

## 2. Структура папок

Всё плоско, в одной папке `src/`; подпапок нет.

```text
apps/web/
├── index.html              точка входа Vite, favicon (inline SVG), Google Fonts
├── vite.config.ts          плагин React, dev-прокси, конфиг vitest
├── public/                 статические картинки (отдаются из корня сайта)
│   ├── f7-logo.png            логотип сайдбара (вырезан из листа дизайн-элементов)
│   ├── f7-final-ok-light.png  заголовок «FINAL OK», светлая тема
│   ├── f7-final-ok-dark.png   заголовок «FINAL OK», тёмная тема
│   └── atv-hero.png           квадроцикл на сцене FOK (прозрачный фон)
└── src/
    ├── main.tsx            монтирование, чтение темы и сайдбара из localStorage ДО первой отрисовки
    ├── App.tsx             сессия, переключатель экранов, хуки usePlan / usePlanCounts
    ├── api.ts              типы ответов + клиент `api.*` (единственное место, где есть fetch)
    ├── format.ts           форматирование (даты, статусы, dash), rowState, pageList
    ├── columns.ts          описание колонок плана
    ├── useColumnPrefs.ts   выбор видимых колонок, хранится в localStorage
    ├── importParse.ts      разбор вставки из Excel / CSV (план и Packing List)
    ├── styles.css          базовая система: токены, тема, макет, таблицы, формы, печать
    ├── f7-components.css   «F7-слой»: компоненты редизайна, анимация кнопок (см. 08)
    ├── AppHeader.tsx       сайдбар + верхняя полоса (общая для всех экранов)
    ├── *Screen.tsx         экраны (по одному на раздел меню)
    ├── *Dialog.tsx, *Sheet.tsx, JobCard.tsx, ProductCard.tsx, NcpDetails.tsx   вложенные компоненты
    ├── Qr.tsx, QuadMark.tsx, SidebarIcons.tsx, StatIcons.tsx, ColumnPicker.tsx
    └── *.test.ts(x)        тесты рядом с кодом; test-setup.ts подключает jest-dom
```

## 3. Навигация между экранами (без роутера)

URL не используется: адрес всегда `/`. Текущий экран — это просто `useState<Screen>` в [`App.tsx`](../../apps/web/src/App.tsx):

```tsx
const [screen, setScreen] = useState<Screen>('plan');
...
switch (screen) {
  case 'plan':  return <PlanScreen session={session} onNavigate={setScreen} onLogout={onLogout} />;
  case 'fok':   return <FokScreen  session={session} onNavigate={setScreen} onLogout={onLogout} />;
  ...
}
```

Тип `Screen` объявлен и экспортируется из [`AppHeader.tsx`](../../apps/web/src/AppHeader.tsx):

```ts
export type Screen = 'plan' | 'ncp' | 'start' | 'stations' | 'complete' | 'fok'
  | 'rework' | 'import' | 'incoming' | 'reports' | 'admin';
```

Жизненный цикл `App`:

1. При монтировании `api.me()` → `session` (`{ userName, mode }`) или `null`.
2. Пока идёт проверка, показывается `<p>Загрузка…</p>`.
3. Нет сессии → `<LoginScreen>`, после входа `setSession({ userName, mode: 'dev' })`.
4. Есть сессия → `switch (screen)`.
5. Выход: `api.logout()` и `onLogout()` → `setSession(null)` (кнопка в `AppHeader`).

**Следствия, о которых надо знать:**

- Каждый экран получает три одинаковых пропса: `session`, `onNavigate`, `onLogout`, и каждый сам рендерит `<AppHeader>` внутри своего корня `div.app`. Общего «layout»-компонента нет.
- При смене экрана предыдущий **размонтируется целиком**: фильтры, страница пагинации, найденный VIN теряются. Исключения — тема, сайдбар и видимые колонки плана (они в `localStorage`).
- Кнопка «Назад» браузера и закладки на экран не работают. Если понадобится глубокая ссылка, это отдельная задача: введение роутера (React Router или хэш-маршрутизация) затронет `App.tsx` и `AppHeader.tsx`, экраны менять не придётся.
- Сайдбар задан массивом `TABS` в `AppHeader.tsx` (ключ, подпись, иконка, необязательная `group` — заголовок группы над пунктом). Заголовок верхней полосы берётся оттуда же: `TABS.find(tab => tab.key === screen)?.label`.

## 4. Слой данных: `api.ts`

[`api.ts`](../../apps/web/src/api.ts) — единственный файл с `fetch`. Состоит из трёх частей.

**Типы ответов** (`ProductionPlanItem`, `NcpItem`, `Delivery`, `DeliveryPackage`, `Paged<T>`, `ImportSession`, `PackingListSession` и др.). Это ручное зеркало серверных DTO: генерации из OpenAPI нет, при изменении контракта типы правят вручную (контракт: [`API_CONTRACT.md`](../API_CONTRACT.md) и справочник API рядом в этой папке).

**`ApiError`** и **`request<T>()`**:

```ts
export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером');        // сеть: status === 0
  }
  if (!response.ok) throw new ApiError(response.status, `Ошибка запроса (${response.status})`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
```

Что важно: тело ошибки сервера **не читается**; наружу уходит только код. Экраны различают `0` (нет связи), `401` (нет доступа), `404` (не найдено) и показывают свои русские тексты. Аутентификация — cookie (`credentials: 'same-origin'`); заголовков авторизации нет.

**Объект `api`** — плоский набор методов, сгруппированных комментариями:

| Группа | Методы |
|---|---|
| Сессия | `me`, `login` (`POST /api/v1/dev-auth/login`), `logout` |
| План | `statuses`, `plan({vin,status,statusId,page,pageSize})`, `byVin`, `move`, `print` |
| Переходы статуса | `start` (0→1), `complete` (1→2), `fok` (2→3), `sendToRework` (2→4), `finishRework` (4→2) |
| Импорт плана | `planImportReference`, `stageImport`, `replaceImportRow`, `publishImport` |
| NCP | `ncpTypes`, `ncpStations`, `ncpComponents`, `ncpMissingParts`, `ncpList`, `ncpCreate`, `ncpSetPartInstalled`, `ncpClose` |
| Станции | `stationChecks`, `setStationCheck` |
| Входной контроль | `suppliers`, `incomingComponents`, `addComponent`, `deliveries`, `delivery`, `createDelivery`, `packageByHu`, `stagePackingList`, `replacePackingListRow`, `confirmPackingList`, `recordRowResult`, `increaseQuota`, `closePackage`, `reopenPackage` |

Комментарии «существует только в демо-режиме сервера» в `api.ts` означают: при `DataSource=Sql` соответствующих эндпоинтов нет и вызов вернёт 404. Это ограничение сервера (см. [`SECURITY_AND_DEPLOYMENT.md`](../SECURITY_AND_DEPLOYMENT.md)), клиент его не скрывает.

**Хуки данных** лежат не в `api.ts`, а в [`App.tsx`](../../apps/web/src/App.tsx) (исторически, чтобы `PlanScreen` оставался «про разметку»):

- `usePlan(vin, status, page, pageSize, statusId?)` → `{ data, state: 'loading'|'ready'|'error', error, reload }`. Защита от гонок: счётчик `requestId` (`useRef`), ответ устаревшего запроса отбрасывается.
- `usePlanCounts()` → `{ all, 0, 1, 2, 3 } | null`. Делает пять запросов с `pageSize=1` и берёт только `total`, чтобы не менять сервер.
- `NcpScreen` содержит собственный локальный `useNcpList` с тем же приёмом `requestId`.

## 5. Состояние на экранах

Только локальное: `useState` / `useRef` / `useEffect` / `useCallback`. Глобального стора нет. Общие приёмы, которые встречаются почти везде:

- **`requestId` против гонок.** Перед запросом `const id = ++requestId.current`, после ответа `if (id !== requestId.current) return;`. Так быстрый сканер не получает «старый» ответ поверх нового. Используется в `usePlan`, `useNcpList`, `ScanTransitionScreen.lookup`, `FokScreen.lookup`.
- **Скан = Enter.** Сканер штрихкодов эмулирует клавиатуру: быстрый ввод строки и Enter. Поэтому поля сканирования это обычный `<input>` в `<form onSubmit>`, `autoFocus`, и повторная фокусировка через `requestAnimationFrame(() => inputRef.current?.focus())` после каждой операции.
- **Статус `Paged<T>`**: `{ items, page, pageSize, total }`; число страниц считают на клиенте: `Math.max(1, Math.ceil(total / pageSize))`.
- **Что хранится в `localStorage`** (все обращения обёрнуты в `try/catch` и не должны ломать UI в приватном режиме):

| Ключ | Кто пишет | Значение |
|---|---|---|
| `f7-theme` | `AppHeader` (кнопка «Тема») | `light` \| `dark` |
| `f7-sidebar` | [`sidebarPref.ts`](../../apps/web/src/sidebarPref.ts) через кнопку «Свернуть/Развернуть меню» | `collapsed` \| `expanded`; пока ключа нет, меню само сворачивается на экране уже 1100 px (`initSidebar` в `main.tsx`, слушает `resize`); явный выбор оператора главнее |
| `f7-density` | [`densityPref.ts`](../../apps/web/src/densityPref.ts) через `DensityToggle` (экран плана) | `compact`; без ключа — комфортная плотность (`data-density` на корне) |
| `f7-sound` | [`resultSignal.tsx`](../../apps/web/src/resultSignal.tsx) (кнопка звука в верхней полосе) | `on` \| `off`; сигнал результата скана (по умолчанию включён) |
| `formulad.mes.plan.columns.v1` | `useColumnPrefs` | JSON-массив ключей видимых колонок |

## 6. Карта экранов

| Пункт меню (`Screen`) | Файл | Методы `api` | Ключевые компоненты | Тесты |
|---|---|---|---|---|
| Вход | [`LoginScreen.tsx`](../../apps/web/src/LoginScreen.tsx) | `login` | `QuadMark` | — (покрыт через `App.test.tsx`) |
| Производственный план (`plan`) | [`PlanScreen.tsx`](../../apps/web/src/PlanScreen.tsx) | `plan`, `statuses`, `byVin`, `move`, `print` | `ProductCard`, `ColumnPicker`, `MoveDialog`, `JobCardDialog`, `NcpPrintDialog`; хуки `usePlan`, `usePlanCounts`, `useColumnPrefs`; `COLUMNS` | `PlanScreen.test.tsx`, `App.test.tsx` |
| Импорт плана (`import`) | [`ImportScreen.tsx`](../../apps/web/src/ImportScreen.tsx) | `planImportReference`, `stageImport`, `replaceImportRow`, `publishImport` | `importParse.ts` | `ImportScreen.test.tsx` |
| Старт (`start`) | [`StartScreen.tsx`](../../apps/web/src/StartScreen.tsx) | `start` | `ScanTransitionScreen` | `StartScreen.test.tsx` |
| Станции (`stations`) | [`StationScreen.tsx`](../../apps/web/src/StationScreen.tsx) | `byVin`, `stationChecks`, `setStationCheck`, `ncpList`, `ncpStations`, `ncpComponents`, `ncpTypes`, `ncpCreate` | `NcpCreateDialog` | `StationScreen.test.tsx` |
| Завершение (`complete`) | [`CompleteScreen.tsx`](../../apps/web/src/CompleteScreen.tsx) | `complete` | `ScanTransitionScreen` | — (отдельного теста нет) |
| FOK (`fok`) | [`FokScreen.tsx`](../../apps/web/src/FokScreen.tsx) | `byVin`, `ncpMissingParts`, `fok`, `sendToRework`, `plan`, `ncpStations` | собственная разметка `f7mes__*` | `FokScreen.test.tsx` |
| Rework (`rework`) | [`ReworkScreen.tsx`](../../apps/web/src/ReworkScreen.tsx) | `finishRework`, `ncpMissingParts`, `ncpList`, `ncpSetPartInstalled`, `ncpClose` | `ScanTransitionScreen` + `ReworkNcpPanel` + `NcpDetails` | `ReworkScreen.test.tsx` |
| Несоответствия (`ncp`) | [`NcpScreen.tsx`](../../apps/web/src/NcpScreen.tsx) | `ncpList`, `ncpTypes`, `ncpStations`, `ncpComponents`, `ncpCreate`, `ncpSetPartInstalled`, `ncpClose` | `NcpDetails`, `NcpCreateDialog`, `NcpPrintDialog`, `NcpSheet`, `NcpSummarySheet` | `NcpScreen.test.tsx` |
| Входной контроль (`incoming`) | [`IncomingInspectionScreen.tsx`](../../apps/web/src/IncomingInspectionScreen.tsx) | `deliveries`, `delivery`, `createDelivery`, `suppliers`, `addComponent`, `packageByHu`, `stagePackingList`, `replacePackingListRow`, `confirmPackingList` | `DeliveryCreateDialog`, `PackageDialog` (там `recordRowResult`, `increaseQuota`, `closePackage`, `reopenPackage`) | `IncomingInspectionScreen.test.tsx` |
| Отчётность (`reports`) | [`ReportsScreen.tsx`](../../apps/web/src/ReportsScreen.tsx) | `usePlanCounts`, `plan`, `ncpList`, `deliveries` | агрегирование на клиенте (`summarizeNcp`, `summarizeIncoming`) | `ReportsScreen.test.tsx` |
| Администрирование (`admin`) | [`AdminScreen.tsx`](../../apps/web/src/AdminScreen.tsx) | `planImportReference`, `ncpComponents`, `ncpStations`, `suppliers` | вкладки справочников, только чтение | — |

Сквозные тесты без привязки к одному экрану: `JobCardDialog.test.tsx` (печать), `format.test.ts` (форматирование).

Состояния изделия (`statusId`): `0` Запланировано · `1` В работе · `2` Производство завершено · `3` FOK пройден · `4` Rework. Подписи — `statusCodeLabel()` в [`format.ts`](../../apps/web/src/format.ts). Неизвестный код не ломает UI (показывается «код N»). Допустимые переходы и бизнес-правила описаны в [`SPECIFICATION.md`](../SPECIFICATION.md) и в справочнике предметной области этой папки.

## 7. `ScanTransitionScreen` — общий экран перехода по сканеру

[`ScanTransitionScreen.tsx`](../../apps/web/src/ScanTransitionScreen.tsx) реализует механику, общую для **Старт**, **Завершение** и **Rework**. Каждый из этих экранов — тонкая обёртка (~25 строк), которая только передаёт параметры:

```tsx
// StartScreen.tsx
<ScanTransitionScreen
  screen="start" session={session} onNavigate={onNavigate} onLogout={onLogout}
  title="Запуск в производство"
  eligibleStatusId={0} afterStatusId={1}
  confirmLabel="Запустить" listTitle="Ожидают запуска"
  onConfirm={(vin) => api.start(vin)}
/>
```

### Пропсы

| Проп | Назначение |
|---|---|
| `screen`, `session`, `onNavigate`, `onLogout` | для `AppHeader` |
| `title` | заголовок экрана (h1) |
| `eligibleStatusId` | изделие допустимо только в этом статусе (Старт 0, Завершение 1, Rework 4) |
| `afterStatusId` | только для текста «Готово: VIN → «…»» |
| `confirmLabel`, `listTitle` | подпись главной кнопки и заголовок правой очереди |
| `onConfirm(vin)` | вызов API перехода |
| `extraCheck?(item)` | доп. проверка сверх статуса; вернуть текст причины блокировки или `null`. Rework использует её для проверки незакрытой обязательной детали |
| `extraContent?(item, refresh)` | произвольный блок внутри карточки; Rework выводит там список NCP. `refresh` перезапускает поиск того же VIN |
| `secondaryActionLabel`, `secondaryAfterStatusId`, `onSecondaryAction` | альтернативное действие, доступное только когда статус подошёл, а `extraCheck` заблокировал (исторически — «Отправить в Rework» на FOK; сейчас FOK написан отдельно, см. §8) |

### Механика «первый скан ищет, второй подтверждает»

```text
ввод VIN + Enter  ──► onSubmit
   │
   ├─ найденное изделие уже на экране, eligible, и введён ТОТ ЖЕ VIN  ──► confirm(vin) → onConfirm → баннер «Готово»
   └─ иначе                                                           ──► lookup(vin)
         api.byVin → статус ≠ eligibleStatusId? → баннер-ошибка «Статус «…», ожидался «…»»
                   → иначе extraCheck → причина блокировки или «можно подтверждать»
```

- `eligible = found !== null && message === null` — единственный источник истины: любая ошибка (статус или `extraCheck`) записывается в `message`, кнопка подтверждения отключается.
- Если между поиском и подтверждением статус изменил кто-то другой, `confirm` падает в `catch`, карточка сбрасывается, показывается «Не удалось выполнить переход — отсканируйте VIN ещё раз».
- Правая колонка «очередь» — `api.plan({ statusId: eligibleStatusId, pageSize: 25 })`; клик по записи запускает `lookup`.
- Разметка (редизайн): блок `.f7plan__scanbar` (заголовок + `.f7mes__scan`), баннер `.scan-banner scan-ok|scan-bad` с иконкой, карточка `.scan-found` (+`scan-found-blocked`), очередь `.pending-list` с шевроном. Корень экрана — `div.app.f7plan`.
- Для доступности: `<input aria-label="Сканирование VIN">`, карточка `aria-label="Найдено изделие {vin}"`, баннер `role="status"` — на них опираются тесты (см. §12).

## 8. `FokScreen` — отдельный экран

FOK когда-то был четвёртой обёрткой над `ScanTransitionScreen`; теперь это самостоятельный экран ([`FokScreen.tsx`](../../apps/web/src/FokScreen.tsx)). Раскладка («пульт FOK»): сверху поле скана и баннер статуса; **лента очереди** (`.f7mes__strip`, чипы `.f7mes__chip` с отметкой выбранного изделия); ниже слева карточка изделия (`.f7mes__identity`) со списком **условий FOK** (`.f7mes__conds`) и крупными кнопками действий, справа — **схема готовности** ([`ReadinessTwin.tsx`](../../apps/web/src/ReadinessTwin.tsx)): кольцо из сегментов-станций вокруг изображения квадроцикла. Расчёт цвета станции общий с экраном «Станции» и вынесен в [`stationReadiness.ts`](../../apps/web/src/stationReadiness.ts) (`stationState`, `readinessSummary`; тесты `stationReadiness.test.ts`).

Поведение:

1. Скан/клик по очереди → `lookup(vin)`: `api.byVin`; если `statusId !== 2` — ошибка статуса, иначе `api.ncpMissingParts(vin)`.
2. Есть незакрытые обязательные детали (`missing.length > 0`) → `blocked`: баннер «FOK заблокирован — {причина}», в карточке список деталей, кнопка «Открыть NCP →» (`onNavigate('ncp')`), кнопка «Отправить в Rework» (`api.sendToRework`).
3. `eligible = found.statusId === 2 && !blocked && message === null`.
4. Подтверждение: кнопка «Подтвердить FOK» **или** повторный скан того же VIN → открывается **модальное окно подтверждения** (`showModal`) → «Подтвердить FOK» → `api.fok(vin)`.
5. Один баннер статуса (`role="status"`), его текст — `message.text`, а для блокировки `FOK заблокирован — {message.text}`. Отдельного «зелёного» баннера нет: при успехе тот же баннер получает `data-type="ready"`.

Схема готовности (режим `TwinMode`): `idle` — изделия нет; `ready` — фары мягко горят; `blocked` — красные фары, красная пульсирующая рамка, станции с открытым NCP красные; `done` — после подтверждения кольцо целиком зелёное, подпись FINAL OK, вспышка фар. Данные для кольца FOK подгружает отдельно от основной операции (`api.ncpComponents` один раз, `api.stationChecks(vin)` и `api.ncpList({vin})` при каждом поиске); сбой этих запросов не мешает самой операции. Блокируют FOK только первые два условия (статус и обязательные детали, так считает сервер); открытые NCP и непроверенные станции — справочные и так подписаны. **Лента станций, которая раньше была жёстко «все выполнено», заменена реальным расчётом.** Сегменты кольца — кнопки: по нажатию под схемой открывается [`StationDetailCard.tsx`](../../apps/web/src/StationDetailCard.tsx) (компоненты станции, кто/когда отметил, открытые NCP; Esc закрывает, `selectedStation` в `FokScreen`). Не сделано: слоистая векторная схема, сборка из узлов — см. [19-UX-REVIEW-NOTES.md](19-UX-REVIEW-NOTES.md#ux-fok-1-перегруженный-экран-и-картинка-без-функции).

## 9. Диалоги

Паттерн единый: корень `div.modal-backdrop` (закрытие по `onMouseDown`), внутри `div.modal` с `role="dialog"`, `aria-modal="true"`, `aria-label`, и `onMouseDown={e => e.stopPropagation()}`. Закрытие по `Esc` реализовано только в `MoveDialog` и `DeliveryCreateDialog` (слушатель `keydown` на `window`); в остальных диалогах его нет. Фокус-ловушки (focus trap) в коде не найдено.

| Диалог | Файл | aria-label | Вызывает |
|---|---|---|---|
| Перенос на позицию | `MoveDialog.tsx` | `Переместить изделие {vin}` | `onMove(toPosition)` → `api.move` в `PlanScreen` |
| Регистрация NCP | `NcpCreateDialog.tsx` | `Регистрация несоответствия` | `onCreate(input)` → `api.ncpCreate`; принимает `defaultVin`, `defaultStation`, `defaultComponentCode` |
| Новая поставка | `DeliveryCreateDialog.tsx` | `Новая поставка` | `api.createDelivery` через родителя |
| Коробка (HU) | `PackageDialog.tsx` | `Коробка {huNumber}` | `recordRowResult`, `increaseQuota`, `closePackage`, `reopenPackage` |
| JobCard | `JobCardDialog.tsx` | `JobCard {vin}` / `JobCard — N изделий` | `api.print` для каждого, затем `window.print()` |
| NCP-лист | `NcpPrintDialog.tsx` | `NCP-лист {number}` / `Сводный NCP-лист {vin}` | `api.byVin`, печать |
| Подтверждение FOK | внутри `FokScreen.tsx` | (нет `role="dialog"`; `div.f7mes__overlay > div.f7mes__modal`) | `confirm(vin)` |

> Модалка подтверждения FOK написана отдельно от общего `.modal` (классы `f7mes__overlay` / `f7mes__modal`) и **не** имеет `role="dialog"` — это расхождение с остальными диалогами.

## 10. Печать: JobCard, NCP-листы, QR

- **QR** — [`Qr.tsx`](../../apps/web/src/Qr.tsx): рисует `<canvas>` через `qrcode` прямо в браузере (`QRCode.toCanvas(canvas, value, { width, margin: 1 })`), без сетевых вызовов. Для JobCard значение = VIN (ответ по умолчанию на вопрос В-12 спецификации). При ошибке выводится заглушка `role="img"` с текстом.
- **JobCard** — `JobCard.tsx` (бланк) + `JobCardDialog.tsx`: кнопка «Печать» сначала вызывает `api.print(vin)` для каждого изделия (отмечает `PrintDate`, статус **не** меняет), затем `window.print()`. Если отметка не прошла, печать всё равно выполняется, пользователю показывается предупреждение.
- **NCP-листы** — `NcpSheet.tsx` (индивидуальный, на деталь) и `NcpSummarySheet.tsx` (сводный по VIN), обёрнутые `NcpPrintDialog.tsx` (`mode="individual" | "summary"`).
- **CSS печати** (`styles.css`, `@media print`): всё скрывается, видимой остаётся только `.print-area`; `.no-print` — `display: none !important`. Важное правило, зафиксированное комментарием в коде: `no-print` нельзя ставить на `.modal-backdrop`, потому что это предок `.print-area`, а `display: none` убирает всё поддерево.

## 11. Тема и сайдбар

Состояние темы и сайдбара живёт в **data-атрибутах на `<html>`** и в `localStorage`, а не в React-стейте:

| Атрибут на `:root` | Значения | Эффект |
|---|---|---|
| `data-theme` | `light` (атрибута нет) \| `dark` | `:root[data-theme="dark"]` переопределяет CSS-переменные и ряд правил |
| `data-sidebar` | нет \| `collapsed` | `:root[data-sidebar="collapsed"] { --sidebar-w: 72px }`; подписи скрываются |

`main.tsx` читает оба ключа из `localStorage` **до** `createRoot(...).render()`, поэтому при перезагрузке нет вспышки неверной темы и скачка ширины. `AppHeader` при переключении пишет и атрибут, и `localStorage`.

Сворачиваемый сайдбар (редизайн):

- Кнопка внизу сайдбара (`.sidebar-toggle`, `aria-expanded`, `aria-label` «Свернуть меню» / «Развернуть меню»).
- Ширина управляется одной переменной `--sidebar-w` (216px → 72px); `.sidebar { width: var(--sidebar-w) }` и `.app { margin-left: var(--sidebar-w) }` анимируются через `transition` (отключается при `prefers-reduced-motion`). Контент экранов ничего не знает о сайдбаре.
- Подписи пунктов обёрнуты в `<span class="sidebar-label">`, в свёрнутом режиме `display: none`; у каждой кнопки есть `title` (нативная подсказка).
- Логотип в свёрнутом виде — тот же `f7-logo.png`, обрезанный `object-fit: cover` до «F7» (временное решение, отдельного знака нет).
- Автосворачивания на узких экранах (планшет) **нет** — только ручное.

## 12. Доступность: `aria-label` как контракт с тестами

Тесты находят элементы по ролям и подписям, поэтому **подписи — часть публичного контракта**. Менять их без обновления тестов нельзя. Основные:

| Где | Подпись / роль | Кто на неё опирается |
|---|---|---|
| Поле скана на Старт/Завершение/Rework | `aria-label="Сканирование VIN"` | `StartScreen`, `ReworkScreen`, `FokScreen` тесты |
| Поле скана на FOK | `aria-label="Сканирование VIN"` (подпись на экране — «ОТСКАНИРУЙТЕ ИЛИ ВВЕДИТЕ VIN», `id`/`htmlFor`) | `FokScreen.test.tsx` |
| Найденное изделие | `aria-label="Найдено изделие {vin}"` (в `ScanTransitionScreen` на `<article>`, в `FokScreen` на `<section>`) | тесты скан-экранов |
| Баннер результата | `role="status"` (на FOK — **ровно один** на экране) | `findByRole('status')` |
| Главная кнопка FOK | имя ровно «Подтвердить FOK» (значок `✓` обёрнут в `aria-hidden`) | `getByRole('button', { name: 'Подтвердить FOK' })` |
| Поиск в плане | `aria-label="Поиск VIN или сканирование"` | `PlanScreen.test.tsx` |
| Строка плана | `aria-label="Изделие {vin}"` | двойной клик → JobCard |
| Чекбокс печати | `aria-label="Выбрать {vin} для печати"` | `PlanScreen.test.tsx` |
| Карточка изделия | `aria-label="Карточка изделия {vin}"` | `App.test.tsx` |
| Кнопки карточки изделия | видимый текст «Печать» и «NCP-лист» | `App.test.tsx`, `PlanScreen.test.tsx` |
| Станция | `aria-label="Станция {N} — {состояние}"` | `StationScreen.test.tsx` |
| Строка NCP | `aria-label="Строка {number}"`; `aria-label="Поиск по VIN"` | `NcpScreen.test.tsx` |
| Редактируемые ячейки импорта / Packing List | `aria-label="Строка {N}: {поле}"` | `ImportScreen`, `IncomingInspectionScreen` тесты |
| Диалоги | см. таблицу §9 | `findByRole('dialog', { name })` |

Правило: **декоративные** элементы (значки `✓`, `⚠`, шевроны `›`, символ сканера `▥`) помечаются `aria-hidden="true"`, чтобы не попадать в имя кнопки и не ломать `getByRole(..., { name })`. Заголовок «FINAL OK» — картинки; настоящий `h1` скрыт визуально классом `.f7mes__sr`.

Известные пробелы доступности: см. [08 §6](08-UI-DESIGN-SYSTEM.md#6-известный-ux-долг-и-план-улучшений) (focus-ring обрезается `clip-path`, контраст кнопки «Выход», микро-текст 9–11px).

## 13. Тесты (vitest)

Запуск: `npm run test` (всё) или `npx vitest run src/FokScreen.test.tsx` (один файл). Конфиг — в `vite.config.ts` (`jsdom`, `globals: true`, `setupFiles: ['./src/test-setup.ts']`, где единственная строка `import '@testing-library/jest-dom/vitest'`).

**Паттерн мока сети.** Реального сервера нет; `fetch` подменяется через `vi.stubGlobal`. Хелпер `mockFetch(route)` **скопирован в каждый тестовый файл** (общего модуля нет):

```ts
type Route = (url: string, method: string) => { status?: number; body?: unknown } | undefined;

function mockFetch(route: Route) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const result = route(url, method);
    if (!result) return new Response('{}', { status: 404 });      // неописанный маршрут = 404
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());
```

Типичный тест:

```tsx
mockFetch((url) => {
  if (url.includes('statusId=2')) return { body: { items: [CLEAN], page: 1, pageSize: 25, total: 1 } };
  if (url.endsWith('/production-plan/DEMO-VIN-00003')) return { body: CLEAN };
  if (url.includes('/ncp/missing-parts')) return { body: [] };
  return undefined;
});
render(<FokScreen session={session} onNavigate={noop} onLogout={noop} />);
await userEvent.type(screen.getByLabelText('Сканирование VIN'), 'DEMO-VIN-00003{Enter}');
await screen.findByLabelText('Найдено изделие DEMO-VIN-00003');
expect(screen.getByRole('button', { name: 'Подтвердить FOK' })).toBeEnabled();
```

Конвенции:

- Данные-фикстуры (`CLEAN`, `BLOCKED`, `ITEMS`, `item(vin, seqn)`) объявляются вверху файла и содержат **все** поля `ProductionPlanItem`.
- Порядок проверок в `route`: сначала более специфичные URL (`/production-plan/DEMO-VIN-00003`, `/ncp/missing-parts`), потом общие — иначе `includes` сработает не на тот.
- `userEvent` (не `fireEvent`); ожидание асинхронных появлений — `findBy*` / `waitFor`.
- Тестируется **поведение и подписи**, а не стили: CSS в vitest не участвует (jsdom не применяет f7-слой), поэтому визуальные регрессии тестами не ловятся.

## 14. Рецепты

### 14.1. Добавить новый экран

1. Создайте `src/MyScreen.tsx` с тем же интерфейсом пропсов, что у остальных:
   ```tsx
   export function MyScreen({ session, onNavigate, onLogout }: {
     session: { userName: string | null; mode: string };
     onNavigate: (screen: Screen) => void;
     onLogout: () => void;
   }) {
     return (
       <div className="app f7plan">
         <AppHeader screen="my" onNavigate={onNavigate} session={session} onLogout={onLogout} />
         <div className="f7plan__title"><span className="f7mes__slash" aria-hidden="true" />
           <div><h1>МОЙ ЭКРАН</h1><small>Описание</small></div></div>
         {/* ... */}
       </div>
     );
   }
   ```
   Не забудьте `import './f7-components.css';` в экране, если используете его классы.
2. Добавьте ключ в тип `Screen` (`AppHeader.tsx`) и пункт в массив `TABS` (там же).
3. Добавьте `case 'my':` в `switch` в `App.tsx` (TypeScript подскажет, если `switch` перестал быть исчерпывающим).
4. Если нужны новые данные — метод в `api.ts` и тип ответа.
5. Тест `MyScreen.test.tsx` по образцу §13.

### 14.2. Добавить пункт меню

Только `TABS` в `AppHeader.tsx`: `{ key, label, Icon, group? }`. Иконка — компонент из [`SidebarIcons.tsx`](../../apps/web/src/SidebarIcons.tsx) (принимает `className`). `group` ставьте только на **первый** пункт группы: он рисуется заголовком над этим пунктом. Подпись автоматически попадёт и в верхнюю полосу, и в `title` кнопки.

### 14.3. Добавить колонку в план

1. Если поля нет в `ProductionPlanItem` — добавьте в тип (`api.ts`) и убедитесь, что сервер его отдаёт.
2. Добавьте запись в массив `COLUMNS` ([`columns.ts`](../../apps/web/src/columns.ts)): `{ key, label, value: (i) => ... }`. Для дат — `formatDate`, для необязательных — `dash`.
3. Если колонка не должна быть видимой по умолчанию, добавьте её ключ в список исключений в `DEFAULT_VISIBLE`.
4. `PlanScreen` и `ColumnPicker` подхватят колонку автоматически. Старые сохранённые раскладки продолжат работать (ключи, которых нет в `COLUMNS`, отбрасываются); новая колонка у пользователей с сохранённой раскладкой **не** появится сама, её включают через «Поля». Если нужно изменить смысл раскладки у всех, поднимите версию ключа `formulad.mes.plan.columns.v1` → `v2` в `useColumnPrefs.ts`.

### 14.4. Добавить поле в форму (пример: NCP)

1. Тип данных в `api.ts` (`NcpItem`) и параметры метода (`api.ncpCreate`).
2. Поле в `NcpCreateDialog.tsx` (состояние `useState`, `<label>` + `<input>`, включение в `onCreate`).
3. Отображение: `NcpDetails.tsx` / колонка в `NcpScreen.tsx`; печатный бланк — `NcpSheet.tsx`.
4. Серверная часть и контракт — отдельно (backend, `API_CONTRACT.md`).
5. Обновите тест (`NcpScreen.test.tsx`) и фикстуры `NcpItem` во всех тестах, где они есть (поиск по `componentCode:`).

### 14.5. Добавить колонку/вкладку в Администрирование

В `AdminScreen.tsx`: значение в `AdminTab`, запись в `ADMIN_TABS`, ветка `{tab === '...' && <table>...}` и состояние + загрузка в `useEffect`. Счётчик «Записей: N» берёт значение из объекта-словаря по ключу вкладки — добавьте и туда.

### 14.6. Написать тест экрана

1. Скопируйте шапку из любого `*.test.tsx` (импорты, `mockFetch`, `beforeEach/afterEach`).
2. Опишите фикстуру целиком (все поля типа).
3. В `route` добавьте только те URL, которые экран реально дёргает при монтировании и в сценарии; остальное вернёт 404 и экран покажет «нет связи» — это сигнал, что вы забыли маршрут.
4. Ищите элементы по `getByRole`/`getByLabelText`, не по классам.
5. Проверьте: `npx vitest run src/MyScreen.test.tsx`, затем весь набор `npm run test`.

### 14.7. Изменить подпись, на которую опирается тест

Меняйте и код, и тест в одном коммите (список контрактов — §12). Если нужна «человеческая» подпись для глаза и «стабильная» для теста, дайте кнопке `aria-label` с прежним именем.

## 15. Известные ограничения кода

Это факты о текущем состоянии, найденные при написании справочника. Не все из них баги.

| № | Что | Где | Комментарий |
|---|---|---|---|
| К1 | Шрифты тянутся с Google Fonts | `index.html` | На рабочем месте без интернета UI покажет системные шрифты. Для цеха лучше self-host (`public/fonts` + `@font-face`). |
| К2 | Нет роутера, глубокие ссылки и «Назад» не работают | `App.tsx` | См. §3. |
| К3 | `mockFetch` дублируется в каждом тесте | `*.test.tsx` | Вынести в `src/test-utils.ts` — безопасный рефакторинг. |
| К4 | `ApiError` не несёт тело ответа сервера | `api.ts` | Экраны не могут показать причину отказа от сервера (например, текст валидации), только код. |
| К5 | Типы API ведутся вручную | `api.ts` | Риск расхождения с сервером; генерация из OpenAPI не настроена (не подтверждено кодом, что у сервера есть схема). |
| К6 | Нет фокус-ловушки в модалках; Esc закрывает только `MoveDialog` и `DeliveryCreateDialog` | `*Dialog.tsx`, `FokScreen.tsx` | Остальные диалоги и модалка FOK по Esc не закрываются. |
| К7 | У `CompleteScreen` и `AdminScreen` нет собственных тестов | — | `CompleteScreen` использует тот же `ScanTransitionScreen`, что покрыт через Start/Rework. |
| К10 | Метод `api.incomingComponents` объявлен, но нигде не вызывается | `api.ts` | Мёртвый код; кандидат на удаление. |
| К8 | В `styles.css` используется переменная `--state-in-work`, которой **нет** в `:root` (определена `--st-work`) | `styles.css` (`.badge-ok`, `.scan-ok`, и др.) | В светлой теме цвет текста этих элементов не применяется (`var()` без значения). Исправление — заменить на `--st-work` или объявить переменную. |
| К9 | Класс `row-fok` используется и для плана («ФОК пройден»), и для NCP (закрыто) с разными цветами полосы | `f7-components.css` (строки с `tr.row-fok`) | Позднее правило (зелёное, NCP) перекрывает раннее (фиолетовое, план): строка «ФОК пройден» в плане получает зелёную полосу вместо фиолетовой. См. [08, П12](08-UI-DESIGN-SYSTEM.md#6-известный-ux-долг-и-план-улучшений). |
