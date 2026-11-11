# Тестовая среда FormulaD MES (Docker)

SQL Server 2022 Developer в Docker с базой `FormulaD_TEST` и тестовыми данными.

## Быстрый старт

```bash
# Всё в одной команде: Docker + API + UI
./stand/stand.sh up

# Открыть http://localhost:5080
# Логин: admin / F7mes
```

## Только Docker SQL

```bash
docker compose -f docker/docker-compose.yml up -d

# Строка подключения:
# Server=localhost,1433;Database=FormulaD_TEST;User ID=mes_writer;Password=MesWriter2024!;TrustServerCertificate=True
```

## Сброс данных

```bash
./stand/stand.sh reset    # или вручную:
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d
```

## Логины БД

| Логин       | Пароль           | Права          |
|-------------|------------------|----------------|
| sa          | FormulaD_Test2024! | sysadmin     |
| mes_reader  | MesReader2024!   | db_datareader  |
| mes_writer  | MesWriter2024!   | read + write   |

## Тестовые данные

6 изделий (`DEMO-VIN-00001`…`00006`), 15 компонентов, 8 типов несоответствий,
4 поставщика, 2 NCP-записи. Данные совпадают с фикстурой `fixtures/production-plan.demo.json`.
