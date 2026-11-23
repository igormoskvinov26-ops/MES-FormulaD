# SQL Migrations

Нумерованные миграции схемы для FormulaD_TEST.

## Структура файлов

```
sql/migrations/
  0001_create_app_tables.sql            — прямая миграция
  0001_create_app_tables.rollback.sql   — откат (DROP TABLE)
  README.md                             — этот файл
```

## Как работает

1. Приложение при старте в режиме `DataSource=Sql` ищет каталог `sql/migrations/`.
2. Читает таблицу `__schema_version` (создаётся миграцией 0001).
3. Выполняет `.sql`-файлы, чей номер ещё не записан в `__schema_version`.
4. Файлы `*.rollback.sql` автоматически пропускаются.

## Порядок развёртывания

```
# 1. Применить миграции (DBA или автоматически при старте приложения)
sqlcmd -S <сервер> -d FormulaD_TEST -U <админ> -i sql/migrations/0001_create_app_tables.sql

# 2. Дать права mes_writer (таблицы уже существуют — Msg 15151 больше не возникает)
sqlcmd -S <сервер> -v MesWriterPassword="<пароль>" -i sql/create-writer-login.sql

# 3. Запустить приложение — оно проверяет __schema_version и пропускает уже применённые
```

## Правила добавления миграций

- Файл: `NNNN_описание.sql` (4 цифры, snake_case). Откат: `NNNN_описание.rollback.sql`.
- Все DDL-операции идемпотентны (`IF OBJECT_ID(...) IS NULL`).
- В конце миграции — `INSERT INTO __schema_version`.
- Откат удаляет таблицы/колонки **и** строку из `__schema_version`.
- Миграция не содержит секретов и не подключается к PROD.

## Текущая версия

| # | Файл | Описание |
|---|------|----------|
| 1 | `0001_create_app_tables.sql` | `__schema_version`, `tblComponentCheck`, 5 таблиц входного контроля |
| 2 | `0002_qc_checklist.sql` | Чеклист ОТК |
| 3 | `0003_component_model_ids.sql` | Идентификаторы моделей в компонентах |
| 4 | `0004_event_log.sql` | Журнал событий |
| 5 | `0005_print_template.sql` | Шаблоны печатных форм |
| 6 | `0006_ncp_part_installed.sql` | `PartInstalled bit` в `tblNCP` (T-164) |
| 7 | `0007_plan_chassis_number.sql` | `ChassisNumber` в `tblProductionPlan` (T-162) |
