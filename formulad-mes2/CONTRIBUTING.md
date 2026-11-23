# Участие в разработке FormulaD MES

Коротко о том, как работать вместе. Подробности — в [`docs/handbook/12-DEVELOPER-WORKFLOW.md`](docs/handbook/12-DEVELOPER-WORKFLOW.md), быстрый старт — в [`docs/handbook/00-README.md`](docs/handbook/00-README.md).

## Главное

- **К PROD не подключаемся никогда** (база `FormulaD`, хост `SQLACCESS`). Работаем на демо-данных и на изолированной тестовой базе `FormulaD_TEST`. Это постоянный запрет, он закреплён в коде и в [09-SECURITY-AND-CONSTRAINTS](docs/handbook/09-SECURITY-AND-CONSTRAINTS.md).
- **Секретов в репозитории нет**: ни паролей, ни строк подключения, ни ключей — даже «тестовых». Пароль стенда создаётся при запуске, остальное — через переменные окружения или user-secrets.

## Рабочий процесс

1. Возьмите задачу из бэклога ([`16-BACKLOG`](docs/handbook/16-BACKLOG.md)) или issue; пометьте, что вы её взяли.
2. Создайте ветку от свежего `main`: `feature/T-123-кратко`, `fix/…`, `docs/…`, `chore/…`.
3. Работайте небольшими коммитами в стиле conventional commits (`feat(fok): …`, `fix(plan): …`, `docs: …`, `test: …`).
4. Перед PR запустите проверки локально:

```bash
dotnet test FormulaD.Mes.slnx
cd apps/web && npx tsc --noEmit -p . && npx vitest run
```

5. Откройте PR в `main`, заполните шаблон, дождитесь зелёных проверок CI и ревью. Слияние — squash.
6. Изменили поведение — обновите `docs/handbook/` и добавьте строку в `CHANGELOG.md` → `[Unreleased]`.

## Версии

SemVer, теги `vX.Y.Z`, история изменений — [`CHANGELOG.md`](CHANGELOG.md). Выпуск описан в [`21-GITHUB-SETUP`](docs/handbook/21-GITHUB-SETUP.md).

## Вопросы и ошибки

Заводите issue по шаблонам («Задача», «Ошибка»). Не прикладывайте пароли, строки подключения и реальные данные предприятия.
