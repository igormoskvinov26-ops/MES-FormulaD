# Архитектура MVP 0.1

```text
Mac разработчика (Development, без соединения с PROD)
  ├─ Браузер ───► Vite/React (localhost)
  │                  │ fetch /api/v1/*
  │                  ▼
  └────────────── ASP.NET Core .NET 10 (localhost)
                       ├─ Authentication/Authorization (DEV ONLY, disabled by default)
                       ├─ ProductionPlan API (GET only)
                       ├─ IProductionPlanReader
                       │     └─ DemoProductionPlanReader → вымышленные JSON-fixtures
                       ├─ Diagnostics (health / logs)
                       └─ [future] SqlProductionPlanReader (TEST SQL read-only; no PROD)

Later, after independent approval:
Windows Server 2019 SQLACCESS
 ├─ existing SQL 2019 / FormulaD
 └─ [future] ASP.NET Core Windows Service + published React static files
```

## Модули

- `Domain` — простые models, бизнес-значения (без fake enum).
- `Application` — интерфейсы чтения, поиск, фильтры, DTO, валидация.
- `Infrastructure.Demo` — adapter fixtures.
- `Infrastructure.Sql` — строго в отдельном следующем тикете, READ ONLY TEST environment.
- `Web API` — endpoints, auth, responses, OpenAPI.
- `Web UI` — компоненты, search/table/details, состояния загрузки.

Возможная физическая структура:

```text
apps/web/                    React + TS + Vite
src/FormulaD.Mes.Api/        ASP.NET Core API
src/FormulaD.Mes.Application/  сервисы/модели (можно объединить, если проще)
tests/                       backend / frontend tests
fixtures/                    синтетические записи
ops/                         шаблоны будущего размещения (без установки)
docs/                        требования и протоколы
```

Не создавать отдельные сервисы ради модульности. Простой модульный монолит. Код должен быть компилируемым на macOS. Windows-specific hosting — в будущем с conditional setup. 

## Основной принцип безопасности

Один только `AsNoTracking()` в EF не гарантирует read-only и не заменяет SQL права. Защита от изменения данных строится из отсутствия эндпоинтов записи и из ограничений SQL-пользователя тестовой БД (в будущей задаче). На стадии MVP 0.1 SQL вообще отключён.
