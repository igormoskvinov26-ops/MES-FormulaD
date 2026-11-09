# 11. Эксплуатация и тестовый стенд

| | |
|---|---|
| **Назначение** | Как запускать систему (стенд, вручную), как она конфигурируется, как её развернуть службой Windows, как обновлять, откатывать и диагностировать |
| **Для кого** | Разработчик, тестировщик, администратор |
| **Проверено по коммиту** | `fc6f055` (стенд проверен запуском; раздел про службу Windows — **чтением скриптов**, на сервере не выполнялся) |

## Оглавление

1. [Порты, пути, логи](#1-порты-пути-логи)
2. [Тестовый стенд (`stand.sh`)](#2-тестовый-стенд-standsh)
3. [Конфигурация и переменные окружения](#3-конфигурация-и-переменные-окружения)
4. [Развёртывание как служба Windows](#4-развёртывание-как-служба-windows)
5. [Обновление и откат](#5-обновление-и-откат)
6. [Диагностика типовых проблем](#6-диагностика-типовых-проблем)

---

## 1. Порты, пути, логи

| Что | Значение | Где задаётся |
|---|---|---|
| API и раздача UI | `http://localhost:5080` | `Properties/launchSettings.json`; `ASPNETCORE_URLS`; `--urls`; `PORT` у стенда |
| Dev-сервер UI (Vite) | `http://localhost:5173`, прокси `/api` → `:5080` | `apps/web/vite.config.ts` |
| Собранный UI | `src/FormulaD.Mes.Api/wwwroot/` (в `.gitignore`) | `npx vite build --outDir <путь> --emptyOutDir` |
| Демо-фикстуры | `fixtures/*.demo.json` → копируются в `bin/…/fixtures/` | `FormulaD.Mes.Api.csproj` (`Content … CopyToOutputDirectory`) |
| Данные стенда (пароль, pid, лог) | `stand/.run/` (`credentials`, `pid`, `stand.log`; в `.gitignore`) | `stand.sh` |
| Проверка живости | `GET /api/v1/health/live` → `{"status":"ok"}` | `Program.cs` |

Логи: стандартный вывод процесса (консоль / `stand/.run/stand.log` у стенда). Файловое логирование не настроено. Уровни — `Logging:LogLevel`
(`Default=Information`, `Microsoft.AspNetCore=Warning`).

## 2. Тестовый стенд (`stand.sh`)

Файл `stand/stand.sh` — запуск стенда одной командой на тестовых данных. Стенд подключается к `FormulaD_TEST` в Docker (строка подключения из переменной окружения или `user-secrets`).

### Команды

| Команда | Действие |
|---|---|
| `./stand/stand.sh up` | Проверяет `dotnet`, `node`, `npm`, `curl` → собирает UI (`npm ci` при отсутствии `node_modules`, `vite build` в `wwwroot`) → собирает API (`dotnet build -c Release`) → генерирует пароль → запускает API в фоне → ждёт готовности до 40 с → печатает адрес, логин, пароль |
| `./stand/stand.sh smoke` | 11 проверок живого стенда: `health/live`; `401` без входа; вход; `401` при неверном пароле; план; NCP; изделие по VIN; `index.html`; логотип; квадроцикл; план не пуст. Код возврата `0`/`1` |
| `./stand/stand.sh status` | `работает: <url>` или `не запущен` (код 1) |
| `./stand/stand.sh down` | Завершает группу процессов, удаляет `pid` |

### Переменные

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `PORT` | `5080` | Порт API (`URL=http://localhost:$PORT`) |
| `STAND_USER` | `demo-operator` | Логин DevAuth |
| `STAND_PASSWORD` | случайный (20 символов) | Пароль DevAuth; иначе генерируется заново при каждом `up` |

Пароль пишется в `stand/.run/credentials` (`chmod 600`; строка 1 — логин, строка 2 — пароль); `smoke` читает его оттуда.

### Как устроен

- Запуск: `ASPNETCORE_ENVIRONMENT=Development DevAuth__Enabled=true DevAuth__Username=… DevAuth__Password=… <новая сессия> nohup dotnet run --no-build -c Release --no-launch-profile --urls $URL > stand.log &`.
- «Новая сессия» делает процесс лидером собственной группы, чтобы `down` гасил всё дерево (`kill -- -PID`): это `setsid` на Linux, а на macOS (где его нет) —
  запасной вариант `perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' --`.
- Если `health/live` уже отвечает, `up` ничего не делает («Стенд уже запущен») — **даже если сервер запущен не этим скриптом**
  (тогда нет `credentials`, и `smoke` откажется работать).
- `down` печатает «Стенд остановлен» всегда, даже если `pid`-файла нет (процесс, запущенный вручную, он не остановит).

### Подводные камни (все наступали на практике)

| Ловушка | Что происходит | Как избежать |
|---|---|---|
| **`pkill -f <шаблон>`** | Шаблон (`dotnet`, `stand/stand.sh`) совпадает с командной строкой **вашей собственной оболочки** → команда убивает сама себя (код 144 / обрыв) | Останавливать по PID (`kill <pid>`), по порту (`fuser -k 5080/tcp`) или командой `stand.sh down`; не использовать `pkill -f` с подстроками, присутствующими в вашей же команде |
| `&` на составной команде | `( cd X && cmd & echo $! )` отправляет в фон **весь список**; канал вывода удерживается, `$!` — не тот процесс, `down` не работает | `&` только на самой команде (так сделано в `stand.sh`) |
| Нет `setsid` на macOS | Скрипт падал | Исправлено перловым запасным вариантом |
| Пайп `up \| tail` | Если фоновый процесс держит stdout, пайп не закрывается | Перенаправлять вывод в файл (в скрипте сервер пишет в `stand.log`) |
| Порт занят | `up` видит чужой ответ `health/live` и пишет «уже запущен» | `PORT=5090 ./stand/stand.sh up`; освободить порт |
| Первая сборка долгая | `npm ci` и `dotnet build` качают пакеты | Подождать; лог сборки скрыт (`>/dev/null`), при сбое запустите шаги вручную |
| `*.png` в `.gitignore` | Картинки из `apps/web/public/` не попадают в коммит | `git add -f` (см. [12](12-DEVELOPER-WORKFLOW.md)) |

### Запуск без стенда (ручной)

```bash
# API
cd src/FormulaD.Mes.Api
DevAuth__Enabled=true DevAuth__Username=demo-operator DevAuth__Password='<пароль>' ASPNETCORE_ENVIRONMENT=Development dotnet run
# UI с горячей перезагрузкой
cd apps/web && npm install && npm run dev        # http://localhost:5173
```

## 3. Конфигурация и переменные окружения

Источники по возрастанию приоритета: `appsettings.json` → `appsettings.{Environment}.json` → user-secrets (только Development) →
переменные окружения → аргументы командной строки. Вложенные ключи в переменных окружения записываются через `__`
(`DevAuth__Password` ≡ `DevAuth:Password`). Имена ключей регистронезависимы.

> `.env.example` — **образец**, а не загружаемый файл: приложение `.env` не читает (загрузчика dotenv в проекте нет).

| Ключ | По умолчанию | Назначение | Секрет |
|---|---|---|---|
| `DataSource` | `Demo` | Источник данных: `Demo` или `Sql` (иное — ошибка старта) | — |
| `Demo:FixturePath` | `fixtures/production-plan.demo.json` рядом с dll | Фикстура плана | — |
| `Demo:NcpFixturePath` | `fixtures/ncp.demo.json` | Фикстура NCP | — |
| `Demo:ComponentsFixturePath` | `fixtures/components.demo.json` | Компоненты | — |
| `Demo:ModelsFixturePath` | `fixtures/models.demo.json` | Модели | — |
| `Demo:ColorsFixturePath` | `fixtures/colors.demo.json` | Цвета | — |
| `Demo:SpecificationsFixturePath` | `fixtures/specifications.demo.json` | Комплектации | — |
| `Demo:SuppliersFixturePath` | `fixtures/suppliers.demo.json` | Поставщики | — |
| `Demo:InspectionQuotasFixturePath` | `fixtures/inspection-quotas.demo.json` | Нормативы входного контроля | — |
| `DevAuth:Enabled` | `false` | Включает dev-вход (**только** при `ASPNETCORE_ENVIRONMENT=Development`) | — |
| `DevAuth:Username` | — | Логин dev-входа | — |
| `DevAuth:Password` | — | Пароль dev-входа (без него вход невозможен) | **да** |
| `Sql:ConnectionString` | — | Строка подключения к SQL Server | **да** |
| `Sql:CommandTimeoutSeconds` | `15` | Таймаут команд SQL | — |
| `ASPNETCORE_ENVIRONMENT` | `Production` (если не задано) | `Development` включает DevAuth, OpenAPI и ослабляет `Secure` cookie | — |
| `ASPNETCORE_URLS` / `--urls` | из `launchSettings`/Kestrel | Адрес прослушивания | — |
| `Kestrel:Endpoints:Http:Url` | — | Адрес в конфиге (используется примером Production) | — |
| `AllowedHosts` | `localhost;127.0.0.1;[::1]` | Фильтр имён хоста | — |
| `Logging:LogLevel:Default` | `Information` | Уровень логов | — |

Минимальные примеры:

```bash
# Строку подключения — через user-secrets, не в файл:
dotnet user-secrets set "Sql:ConnectionString" "Server=<host>;Database=FormulaD_TEST;User ID=<test-login>;Password=<...>;Encrypt=True" --project src/FormulaD.Mes.Api
DevAuth__Enabled=true DevAuth__Username=demo-operator DevAuth__Password='<пароль>' ASPNETCORE_ENVIRONMENT=Development dotnet run
```

Прочитайте [09](09-SECURITY-AND-CONSTRAINTS.md): логин должен иметь права записи
на нужные таблицы (`sql/create-writer-login.sql`); приложение при первом обращении само создаёт таблицы проверок станций и входного контроля.

## 4. Развёртывание как служба Windows

> **Статус: не проверялось.** Описано по `deploy/install-service.bat`, `deploy/appsettings.Production.example.json` и коду
> (`builder.Host.UseWindowsService()`). Размещение на сервере **не является разрешением на ввод в эксплуатацию** (`SECURITY_AND_DEPLOYMENT`):
> блокируют R-001 (нет проверенного резервного копирования PROD), отсутствие корпоративной аутентификации, HTTPS и согласованного порта.

**Что делает `install-service.bat`** (запускать от администратора, лежит рядом с `FormulaD.Mes.Api.exe`): проверяет наличие
`FormulaD.Mes.Api.exe` и `appsettings.Production.json` рядом; при существующей службе останавливает и удаляет её; создаёт службу
`FormulaD-MES` (`DisplayName="FormulaD MES 2.0"`, `start=auto`); запускает. Управление: `sc stop|start|delete FormulaD-MES`.

**Предполагаемая последовательность** *(шаги 1–2 в репозитории не автоматизированы)*:

1. Собрать UI в каталог статики: `cd apps/web && npx vite build --outDir ../../src/FormulaD.Mes.Api/wwwroot --emptyOutDir`.
2. Опубликовать API (например, `dotnet publish src/FormulaD.Mes.Api -c Release -o <папка>`; параметры runtime/self-contained —
   на усмотрение; **не подтверждено**, что `wwwroot` попадёт в публикацию — Web SDK включает его по умолчанию).
3. Скопировать `install-service.bat` в папку публикации; создать там `appsettings.Production.json` по образцу
   `deploy/appsettings.Production.example.json`, подставив **реальные** значения вместо `CHANGE_ME` (файл в `.gitignore` — не коммитить).
4. Запустить `install-service.bat` от администратора.

**Что нужно проверить/решить перед использованием (выявлено чтением):**

| № | Проблема | Следствие |
|---|---|---|
| 1 | В `appsettings.Production.example.json` включён `DevAuth`, но служба запускается в окружении **Production**, где код принудительно выключает DevAuth | После установки **войти нельзя**: все бизнес-эндпоинты отвечают `401`. Запуск службы с `ASPNETCORE_ENVIRONMENT=Development` технически даст вход, но включает и OpenAPI — это решение владельца, не рекомендация |
| 2 | Dev-вход разрешён только с loopback; `AllowedHosts` ограничен `localhost`; Kestrel слушает `http://localhost:5080` | Доступ только с самого сервера; **с цеховых ПК система недоступна** без корпоративной аутентификации и смены привязки/хостов |
| 3 | Пример строки подключения содержит хост `SQLACCESS` (где стоит и PROD) | Допустимо только с `Database=FormulaD_TEST`; убедиться, что логин не имеет доступа к `FormulaD` |
| 4 | `sc create` без `obj=` | Служба запускается под `LocalSystem` — избыточные права; завести отдельную учётку |
| 5 | Описание службы в скрипте — «производственный план (read-only)» | Устарело: система пишет в TEST-базу |
| 6 | Нет HTTPS; cookie вне Development помечается `Secure` | Без HTTPS вход вне Development не заработает |
| 7 | Нет `.NET`-рантайма на сервере? | Для framework-dependent публикации нужен ASP.NET Core Runtime 10 *(не проверено)* |
| 8 | `wwwroot` в `.gitignore` | UI нужно собирать на сборочной машине; в репозитории готового UI нет |

## 5. Обновление и откат

**Стенд / разработка.**

```bash
git pull origin <ветка>
./stand/stand.sh down && ./stand/stand.sh up       # пересобирает UI и API, запускает заново
```

Демо-состояние при перезапуске сбрасывается (это штатно).

**Служба Windows** *(по логике скрипта; не проверялось)*: `sc stop FormulaD-MES` → сохранить текущую папку публикации
(например, переименовать в `…_prev`) → развернуть новую (UI + API + `appsettings.Production.json`) → `sc start FormulaD-MES`.
**Откат** — вернуть сохранённую папку и снова `sc start`. Конфигурация (`appsettings.Production.json`) переносится вручную.

**База данных.** Миграций нет. Приложение само создаёт недостающие таблицы (`tblComponentCheck`, `tblIncoming*`, `tblInspectionQuota`) при
первом обращении (нужны DDL-права). Откат схемы — вручную силами DBA. Резервную копию `FormulaD_TEST` делайте **до** обновления.
Для PROD обновлений и откатов нет — подключения к PROD нет вообще.

## 6. Диагностика типовых проблем

| Симптом | Вероятная причина | Что сделать |
|---|---|---|
| После входа всё равно `401`; в логе «Dev-аутентификация выключена» | Не заданы `DevAuth__Enabled=true`, логин или пароль; окружение не `Development` | Задать переменные; проверить `ASPNETCORE_ENVIRONMENT=Development`; перезапустить |
| `POST /dev-auth/login` → `404` | Условия существования входа не выполнены (раздел 3 документа 09) | То же |
| `POST /dev-auth/login` → `403` «только локально» | Запрос не с loopback или чужой `Origin` | Открывать `http://localhost:5080` с той же машины |
| Белая страница / `404` на `/` | UI не собран: нет `wwwroot/index.html` | `vite build` в `src/FormulaD.Mes.Api/wwwroot` (`stand.sh up` делает это сам) |
| Картинки (логотип, квадроцикл) не грузятся | Не попали из `apps/web/public/` в `wwwroot` (устаревшая сборка) | Пересобрать UI (`--emptyOutDir`) |
| Приложение падает при старте | Нет строки подключения или не указана база | Прочитать сообщение исключения — оно названо точно; исправить конфигурацию |
| `Address already in use` | Порт 5080 занят | Остановить прежний процесс или задать другой `PORT`/`--urls` |
| `stand.sh up` пишет «уже запущен», пароля нет | Сервер запущен вручную, не стендом | Остановить его (по PID/порту) и запустить `up` |
| `smoke` падает на «вход» | Устаревший `stand/.run/credentials` или стенд поднят с другим паролем | `down` → `up` |
| Тесты backend падают массово: «inotify» | Лимит наблюдателей файлов | Не убирать `reloadConfigOnChange=false` в `ApiFactory` |
| Тест frontend: «Unable to find a label with the text of: …» | Изменили подпись/`aria-label` | Согласовать подписи и тесты ([10](10-TESTING.md#7-соглашения)) |
| `dotnet run --no-build -c Release` не стартует | Не собрана конфигурация `Release` | `dotnet build -c Release` (стенд делает это сам) |
| Данные «пропали» | Перезапуск Demo | Штатно: состояние в памяти |
| В SQL-режиме ошибки «Invalid object name» | В TEST нет нужной таблицы / иная схема | Сверить схему (`sql/inspect-schemas.sql`), создать таблицу DBA |
| Команда «убивает саму себя» (код 144, обрыв) | `pkill -f` с шаблоном из собственной команды | См. раздел 2, «Подводные камни» |
