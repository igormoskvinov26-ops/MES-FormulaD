# FormulaD MES 2.0 — Контекст для Claude

## Проект

Система управления производством ATV (квадроциклов). .NET 10 Minimal API + React/Vite SPA.

## Репозиторий

`igormoskvinov26-ops/mes-formulad` (строчные). НЕ `MES-FormulaD`.

## Авторизация

На проде — таблица `dbo.tblUser`: `ID int`, `Login nvarchar(50)`, `PasswordHash nvarchar(50)`,
`FullName`, `UserRole`, `IsActive bit`, `Email`, `Phone`.

**Решение 2026-11:** отказаться от DevAuth (логин/пароль из env-переменных) и авторизовывать
по `tblUser`, как на проде. Цель — MVP, который переключается на прод сменой connection string,
без доработки авторизации. Блокер: нужен настоящий бэкап прода с этой таблицей.

**DevAuth credentials (всегда фиксированные): `admin` / `mes`**

## Локальная разработка (Mac владельца)

**Путь к репо на Mac:** `/Users/imosk/Desktop/MES/audit/2026-11-06/source`

- Проект API: `src/FormulaD.Mes.Api`
- Stand-скрипт: `stand/stand.sh`
- user-secrets хранятся в macOS keychain через `dotnet user-secrets` (проект `src/FormulaD.Mes.Api`)

Команды для Mac:
```bash
cd /Users/imosk/Desktop/MES/audit/2026-11-06/source
./stand/stand.sh up
```

## Тестовая среда

- Docker Compose: `docker/docker-compose.yml` (SQL Server 2022 + init + mes-api)
- Stand-скрипт: `./stand/stand.sh up` — поднимает API на macOS с SQL-режимом
- БД: `FormulaD_TEST`, порт 5080
- Стенд всегда запускается в **SQL-режиме** (DataSource=Sql), Demo-режима нет
- Логины БД: `mes_reader` / `MesReader2024!` (чтение), `mes_writer` / `MesWriter2024!` (запись)
- **SA пароль контейнера `mes-test-sql`: `NLy75RGRgTS0wHqoiYAa1`** (узнан через `docker inspect`)
- SQL connection string хранится в dotnet user-secrets (`Sql:ConnectionString` и `Sql:WriteConnectionString`)

**user-secrets (уже настроены на Mac):**
```
Sql:ConnectionString = Server=localhost,1433;Database=FormulaD_TEST;User ID=mes_reader;Password=MesReader2024!;Encrypt=True;TrustServerCertificate=True
Sql:WriteConnectionString = Server=localhost,1433;Database=FormulaD_TEST;User ID=mes_writer;Password=MesWriter2024!;Encrypt=True;TrustServerCertificate=True
```

**ВАЖНО:** Docker-стенд запускается **на машине владельца**, не в облаке Claude Code.
Облачный контейнер Claude Code не имеет Docker daemon — Docker-in-Docker не работает.
Контейнеры Claude Code эфемерны и пересоздаются каждую сессию.

## Бэкап прода

Владелец предоставлял .bak файл для восстановления реальных данных в тестовую среду.
**ВАЖНО:** Файл .bak нужно хранить в `docker/backup/` и коммитить в репо, чтобы не терять
между сессиями (контейнеры пересоздаются). Init-скрипт должен делать RESTORE DATABASE
вместо seed если .bak присутствует.

`setup.sh` автоматически восстанавливает из .bak если он есть, иначе fallback на seed.

**ПРОВАЛ 2026-11 — не повторять.** Файл `FormulaD.bak` (786432 байт, ровно 768 KiB) с
сигнатурой `MSSQLBAK` оказался **подделкой**, сгенерированной Claude как заглушка в ранней
сессии. Несколько часов ушло на отладку RESTORE, который не мог сработать в принципе.

Правила по бэкапам:
- Настоящий SQL Server .bak начинается с `TAPE` (формат MTF). Проверять: `head -c 4 файл.bak`
- Claude **никогда** не генерирует .bak-заглушки. Нет бэкапа — так и сказать.
- Бинарники **не гонять через чат** (upload → SendUserFile портит файл). Владелец копирует сам.
- Бэкап делается на проде: `BACKUP DATABASE [FormulaD] TO DISK = N'...' WITH INIT, COMPRESSION;`

## Диагностика стенда

`./stand/diag.sh` — снимает всё состояние разом (контейнеры, порты, бандл в образе и
на порту, логи, таблицы, пробный вход). Запускать **первым делом** при любой проблеме
со стендом, вместо отладки по одной команде.

**ПРОВАЛ 2026-11 — не повторять.** Полдня ушло на отладку входа, который «не работал».
Причина: на Mac вне Docker висел старый процесс `FormulaD.Mes.Api`, слушавший
`127.0.0.1:5080`. Docker слушает `*:5080`, но при обращении к `localhost` выигрывает
более точная привязка — все запросы уходили в старый процесс. Логи читали у контейнера,
а отвечал не он. Отсюда «401 на верный пароль» и «пересборка ничего не меняет».

Правило: прежде чем чинить поведение стенда, проверить `lsof -nP -iTCP:5080 -sTCP:LISTEN`
и убедиться, что порт держит только нужный процесс.

## Стратегия

1. Собрать полноценную тестовую среду для проверки всего функционала
2. Сбор замечаний, формирование нового бэклога
3. Доработки, тестирование
4. Демо для бизнеса → если одобрят → катовер и релиз в прод

## Безопасность

- PROD-сервер физически изолирован в другой сети — программная защита убрана (решение владельца)
- Реальных строк подключения/паролей к PROD в репо нет и быть не может
- ForbiddenDatabases, ForbiddenLogins, IsTestEnvironment — удалены из кода

## Принятые решения (история)

| Дата | Решение | Контекст |
|------|---------|----------|
| 2026-10 | Docker для тестовой среды | SQL Server 2022 Developer в контейнере |
| 2026-10 | DevAuth вместо AD/LDAP на этапе теста | T-010 отложен до решения бизнеса |
| 2026-10 | Бэкап прода для тестовых данных | Копия реальных данных вместо синтетики |
| 2026-10 | Раздельные логины read/write | mes_reader (ReadOnly) + mes_writer |
| 2026-10 | PROD-guard убран | Физическая изоляция сети |
| 2026-11 | SqlEventLog вместо InMemoryEventLog | Append-only tblEventLog для аудита |
| 2026-11 | Multi-stage Dockerfile | T-108: одна команда для стенда |
| 2026-11 | Стенд переведён на SQL-режим по умолчанию | Demo-режим убран из stand.sh |
| 2026-11 | DevAuth credentials зафиксированы admin/mes | Больше не генерировать случайные пароли |
| 2026-11 | Путь Mac репо зафиксирован в CLAUDE.md | /Users/imosk/Desktop/MES/audit/2026-11-06/source |

## Выполненные задачи

T-001 ✔, T-002 ✘ (закрыто), T-003 ✔, T-004 ✔, T-005 ✔, T-006 ✔, T-007 ✔,
T-029 ✔, T-077 ✔, T-084 ✔, T-090 ✔, T-091 ◐ (scaffold), T-094 ✔, T-100 ◐, T-108 ✔

## Правила работы

- Короткие ответы на русском
- Коммит + пуш после каждого блока работы
- **Всю историю решений и контекст сохранять в этом файле**
- **Файлы (бэкапы, конфиги) хранить в репо**, не в /tmp
- Не менять credentials без согласования
- Не добавлять в бэклог — делать
- **Перед реализацией — составить план, проанализировать на ошибки и слабые места, потом делать**
- Docker запускается на машине владельца, НЕ в облаке Claude Code (нет Docker daemon)
- Облачный контейнер Claude Code эфемерен — всё что не в репо теряется
- DevAuth credentials всегда `admin` / `mes` — не менять, не генерировать случайные
- **Путь к репо на Mac: `/Users/imosk/Desktop/MES/audit/2026-11-06/source`** — не забывать!
