# FormulaD MES 2.0 — MVP 0.1 (DEMO)

Локальный демонстрационный стенд: ASP.NET Core (.NET 10) API только на чтение + React/TypeScript UI на русском языке.
**Данные синтетические** (`fixtures/production-plan.demo.json`). Подключения к PROD `SQLACCESS` / базе `FormulaD` нет
и в этом MVP не предусмотрено.

## Что умеет

- Экран «Производственный план»: таблица, поиск VIN (клавиатура и сканер), фильтр по статусу, пагинация,
  состояния «Загрузка», «Ничего не найдено», «Нет доступа», «Нет связи с сервером».
- Карточка изделия только для чтения (Enter при полном VIN или клик по строке).
- API `GET /api/v1/...` по `docs/API_CONTRACT.md`. Операций записи производственных данных нет.
- Dev-аутентификация: включается явно, только в Development, только на loopback, пароль — из env/user-secrets.

## Требования

- .NET SDK 10.0
- Node.js 20+ (проверено на 22)

## Запуск (macOS / Linux)

### 1. API

```bash
cd src/FormulaD.Mes.Api
dotnet user-secrets set "DevAuth:Password" "<придумайте локальный пароль>"
DevAuth__Enabled=true DevAuth__Username=demo-operator ASPNETCORE_ENVIRONMENT=Development dotnet run
```

Ожидаемо: API слушает `http://localhost:5080`, в логе — `Now listening on: http://localhost:5080`.
Если `DevAuth:Password` не задан, в логе будет предупреждение, вход невозможен, а защищённые эндпоинты отвечают `401`.

Проверка без UI:

```bash
curl -s http://localhost:5080/api/v1/health/live          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' \
     http://localhost:5080/api/v1/production-plan          # 401
```

### 2. UI

```bash
cd apps/web
npm install
npm run dev
```

Открыть `http://localhost:5173`, войти под `demo-operator` и заданным паролем. Vite проксирует `/api` на `http://localhost:5080`.

### Остановка

`Ctrl+C` в каждом терминале. Фоновых служб, портов брандмауэра и установок в систему проект не создаёт.

## Тесты

```bash
dotnet test                      # из корня formulad-mes2
cd apps/web && npm run test      # vitest
cd apps/web && npm run build     # tsc + vite build
```

## Структура

```text
src/FormulaD.Mes.Api/      ASP.NET Core Minimal API (домен + чтение + endpoints)
tests/                     интеграционные тесты API (xunit)
apps/web/                  React + TypeScript + Vite
fixtures/                  синтетические записи плана
sql/                       только шаблоны SELECT для будущей TEST-интеграции
docs/                      требования, контракты и отчёт о реализации
```

## Ограничения

MVP 0.1 — не промышленная MES. Нет импорта плана, старта/завершения сборки, ФОК, NCP, packing lists, печати и
реальных учётных записей. Подробности — `docs/IMPLEMENTATION_REPORT.md`.
