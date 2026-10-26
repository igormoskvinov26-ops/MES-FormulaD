# Порядок исполнения Codex

| ID | Задача | Критерий готовности |
|---|---|---|
| MES2-001 | Инициализация репозитория и структуры | README, `.gitignore`, проекты backend/frontend открываются |
| MES2-002 | Модель read-only / Demo datasource | JSON fixture, интерфейс Reader, никаких SQL calls |
| MES2-003 | API v1 GET/health/ProblemDetails | контракт, документация OpenAPI DEV, тесты |
| MES2-004 | DEV-only аутентификация | closed by default, без встроенных паролей, 401 |
| MES2-005 | React: список и поиск VIN | экран + фильтры, страницы, состояния |
| MES2-006 | React: карточка изделия | VIN-route/detail, read-only, пустые даты |
| MES2-007 | Тесты и локальная сборка | build/test отчёт и инструкции |
| MES2-008 | Security review и передача РП | no PROD, no secrets, screenshots (если проверены) |

Дальнейшие тикеты, **не в этой реализации**: MES2-010 безопасное TEST SQL подключение; MES2-020 корпоративная auth; MES2-030 операции со статусами после утверждения модели; MES2-040 QC; MES2-050 NCP/cripple; MES2-060 Packing Lists; MES2-070 печать; MES2-080 эксплуатационный пилот и rollback.
