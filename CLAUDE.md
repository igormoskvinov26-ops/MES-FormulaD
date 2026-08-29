# 📋 CLAUDE.md — Проект MES-FormulaD: ACCDB Integration

## 🎯 Обзор проекта

**Название:** Rubl Telegram Admin  
**Цель:** Автоматическая система публикации Telegram Stories для барбершопа РублЪ  
**Статус:** Production Ready + ACCDB Integration (текущая ветка)  
**Версия:** 0.1.0  

### Текущая ветка
- **Ветка:** `claude/accdb-file-reading-w2r4zk`
- **Задача:** Добавить поддержку импорта данных мастеров из Microsoft Access базы данных (.accdb файлы)
- **Приоритет:** Medium — улучшение, не критично для production

---

## 🏗️ Архитектура проекта

### Stack
- **Backend:** Node.js 20+ + Express + TypeScript
- **Frontend:** Admin web UI (HTML/CSS/JS в `web/index.html`)
- **DB:** Vercel KV (Redis) для production, файлы для разработки
- **Рендеринг:** resvg (SVG → PNG без браузера)
- **Планировщик:** node-cron + GitHub Actions

### Основные компоненты

```
src/
├── api/
│   ├── server.ts           # Express setup, middleware, auth
│   └── routes/
│       ├── admin.ts        # Admin endpoints
│       ├── settings.ts     # Settings CRUD
│       ├── cron.ts         # Scheduler endpoints
│       └── (stories.ts)    # Story publishing
├── services/
│   ├── stories/            # SVG → PNG rendering
│   ├── telegram/           # Telegram Bot API integration
│   ├── yclients/           # YCLIENTS API integration
│   ├── reporting/          # Daily reports generation
│   ├── scheduler/          # Job scheduling (node-cron)
│   └── (accdb/)            # ← НОВЫЙ: ACCDB file reading
├── config/
│   ├── env.ts              # Environment variables (Zod schema)
│   ├── settings.ts         # Runtime settings (KV storage)
│   ├── barbers.ts          # Barber configs
│   └── templates.ts        # Story templates
├── store/
│   └── backend.ts          # Storage abstraction (KV vs files)
├── lib/
│   ├── logger.ts           # Structured logging
│   ├── time.ts             # DateTime utils (Europe/Moscow)
│   ├── crypto.ts           # AES-256-GCM encryption
│   └── lock.ts             # Distributed locks (KV)
└── index.ts                # Entry point
```

---

## 📊 Текущее состояние: Данные мастеров

### Где сейчас хранятся данные мастеров

**Источник 1: Environment variables** (`src/config/env.ts`)
```typescript
barberStaffIds: {
  artash: "12345",   // YCLIENTS staff ID
  ksenia: "12346",
  dmitriy: "12347"
}
```

**Источник 2: Hardcoded defaults** (`src/config/settings.ts:52-56`)
```typescript
const DEFAULT_BARBERS = [
  { slug: 'artash', displayName: 'Арташ', template: 'artash' },
  { slug: 'ksenia', displayName: 'Ксения', template: 'ksenia' },
  { slug: 'dmitriy', displayName: 'Дмитрий', template: 'dmitriy' },
];
```

**Как работает:**
1. Данные из env vars загружаются в `AppSettings`
2. Сохраняются в `settings.ts` (KV или файл с шифрованием AES-256-GCM)
3. Доступны через `getSettings()` → `settings.barbers`
4. Используются в `barbers.ts` для получения конфигов: `allBarbers()`, `activeBarbers()`, `barberByStaffId()`

---

## 🔄 Задача: ACCDB Integration

### Что нужно сделать

**Цель:** Позволить администраторам импортировать данные мастеров из Microsoft Access базы данных (.accdb файлы)

**Сценарий использования:**
1. Администратор загружает .accdb файл через web UI
2. Система читает таблицу мастеров из базы
3. Парсит YCLIENTS staff IDs и отображаемые имена
4. Обновляет `AppSettings.barbers` в хранилище
5. Система использует новые данные для Stories и отчетов

### Технические требования

**Поддерживаемые версии ACCDB:**
- Access 2007+ (.accdb формат)
- Иногда Access 2000-2003 (.mdb формат) — опционально

**Структура таблицы в ACCDB (ожидается):**
```
Таблица: "barbers" или "msters" или "мастера"
Колонки:
  - id: Integer (не используется для логики)
  - name: Text (отображаемое имя, например "Арташ")
  - yclients_id: Integer (YCLIENTS staff ID, обязателен)
  - slug: Text (опционально, если нет — генерировать из name)
  - template: Text (опционально, если нет — использовать slug)
  - enabled: Boolean/Integer (опционально, по умолчанию true)
```

**Ожидаемое поведение:**
- ✅ Читать данные без требования к точной структуре БД
- ✅ Гибкие имена колонок (case-insensitive)
- ✅ Валидация: yclients_id должен быть > 0
- ✅ Генерация slug из name если отсутствует
- ✅ Обновление существующих мастеров, добавление новых
- ✅ Логирование всех ошибок и результатов

---

## 🔧 План реализации

### Phase 1: Подготовка (сегодня)
- [ ] Добавить зависимость для чтения ACCDB файлов
- [ ] Изучить доступные Node.js библиотеки для ACCDB
- [ ] Создать module `src/services/accdb/` с типами и интерфейсом

### Phase 2: Core functionality (сегодня-завтра)
- [ ] Реализовать `AccdbService` для чтения .accdb файлов
- [ ] Реализовать парсер таблицы мастеров
- [ ] Добавить валидацию данных (Zod schema)
- [ ] Тесты для AccdbService

### Phase 3: API integration (завтра)
- [ ] Добавить API endpoints:
  - `POST /api/admin/import/accdb` — загрузить и прочитать файл
  - `POST /api/admin/import/accdb/validate` — валидация перед импортом
  - `POST /api/admin/import/accdb/apply` — применить изменения
- [ ] Интегрировать с Settings API
- [ ] Обновить admin web UI с формой загрузки

### Phase 4: Testing & Documentation (завтра)
- [ ] Integration тесты
- [ ] Документация в README.md
- [ ] Примеры ACCDB структуры и использования

---

## 📦 Технический стек для ACCDB

### Вариант 1: `jackcesspy` (рекомендуется)
- **Язык:** TypeScript (работает в Node.js)
- **Статус:** Stable, поддерживается
- **Pros:** Чистая реализация, полная поддержка ACCDB
- **Cons:** Может быть медленнее на больших таблицах

### Вариант 2: `node-adodb` (альтернатива)
- **Требует:** ODBC драйвер Windows Access Database Engine
- **Statус:** Работает только на Windows
- **Не подходит** для Vercel (Linux)

### Вариант 3: Python subprocess (fallback)
- **Требует:** Python 3.8+ + `pyodbc` или `mdb-export`
- **Сложность:** Shell commands, dependency management
- **Не рекомендуется** для Vercel

**Решение:** Использовать `jackcesspy` через npm (или аналог для Node.js)

---

## 🛠️ Структура кода (набросок)

### `src/services/accdb/types.ts`
```typescript
export type AccdbBarberRow = {
  id?: number;
  name: string;
  yclients_id: number;
  slug?: string;
  template?: string;
  enabled?: boolean;
};

export type AccdbImportResult = {
  success: boolean;
  barbers: AccdbBarberRow[];
  errors?: string[];
};
```

### `src/services/accdb/index.ts`
```typescript
export class AccdbService {
  /**
   * Read barbers table from .accdb file
   */
  async readBarbers(filePath: string): Promise<AccdbBarberRow[]> {
    // реализация
  }

  /**
   * Validate and transform rows to AppSettings format
   */
  transformToSettings(rows: AccdbBarberRow[]): BarberSetting[] {
    // реализация
  }

  /**
   * Merge with existing settings
   */
  merge(existing: BarberSetting[], imported: AccdbBarberRow[]): BarberSetting[] {
    // реализация
  }
}
```

### `src/api/routes/import.ts` (новый)
```typescript
router.post('/import/accdb', auth, async (req, res) => {
  // Handle file upload and validation
});

router.post('/import/accdb/apply', auth, async (req, res) => {
  // Apply changes to settings
});
```

---

## 🧪 Тестирование

### Unit tests
- `src/services/accdb/index.test.ts`
  - ✅ Чтение .accdb файла
  - ✅ Парсинг таблицы
  - ✅ Валидация данных
  - ✅ Трансформация в BarberSetting
  - ✅ Мерж с существующими данными

### Integration tests
- API endpoints
- Сохранение в settings
- Использование в Stories

### Test fixtures
- Пример .accdb файл с тестовыми данными в `test/fixtures/`

---

## 🔒 Безопасность

**Важные моменты:**
- ✅ ACCDB файлы могут содержать чувствительные данные — обработать как доверяемый source
- ✅ Валидировать все данные из ACCDB
- ✅ Логировать все импорты (audit trail)
- ✅ Permissions: только `x-admin-token` может импортировать
- ✅ Backup: сохранять старые settings перед импортом (для отката)

---

## 📚 Связанные файлы

| Файл | Зачем | Статус |
|------|-------|--------|
| `src/config/barbers.ts` | Барберы конфиг | ✅ Готов, используется |
| `src/config/settings.ts` | Runtime settings | ✅ Готов, нужны изменения для import |
| `src/api/routes/settings.ts` | Settings API | ✅ Готов, нужны новые endpoints |
| `web/index.html` | Admin UI | ✅ Готов, нужно добавить форму |
| `src/services/accdb/` | **← НОВЫЙ** | 🟢 Предстоит создать |

---

## 🚀 Quick Start для разработки

```bash
# 1. Убедитесь, что на ветке
git checkout claude/accdb-file-reading-w2r4zk

# 2. Установите зависимости
npm install

# 3. Создайте структуру directories
mkdir -p src/services/accdb
mkdir -p test/fixtures

# 4. Создайте типы и основной модуль
# (следуйте плану выше)

# 5. Тестируйте
npm run test

# 6. Коммитьте
git add .
git commit -m "feat(accdb): add ACCDB file import support"

# 7. Пушьте
git push -u origin claude/accdb-file-reading-w2r4zk
```

---

## ❓ Вопросы для уточнения

1. **Формат ACCDB:** Какая точно таблица и колонки в текущей базе?
   - Есть ли у вас пример .accdb файла?
   
2. **Update strategy:** Перезаписать все мастера или мерж?
   - Рекомендация: Мерж с опцией overwrite для каждого

3. **UI/UX:** Где в admin UI должна быть форма загрузки?
   - Рекомендация: Отдельный раздел Settings → Import

4. **Fallback:** Что делать если ACCDB файл не читается?
   - Рекомендация: Откатить к предыдущей версии settings

---

## 📖 Дополнительная информация

### Как использовать barbers в коде
```typescript
import { allBarbers, activeBarbers, barberBySlug } from 'src/config/barbers.ts';

const all = allBarbers();  // Все мастера (включая отключенные)
const active = activeBarbers();  // Только активные (enabled && staffId > 0)
const artash = barberBySlug('artash');  // Найти по slug
```

### Как обновить settings
```typescript
import { getSettings, updateSettings } from 'src/config/settings.ts';

const current = getSettings();
current.barbers.push({ ... });
await updateSettings(current);
```

### Testing YCLIENTS integration
- See `src/services/yclients/` для примеров API запросов
- YCLIENTS используется для получения доступных слотов и статистики

---

## ✅ Checklist для завершения

- [ ] Выбрать и установить ACCDB библиотеку
- [ ] Создать `AccdbService`
- [ ] Написать unit тесты
- [ ] Добавить API endpoints
- [ ] Обновить Settings API
- [ ] Обновить admin UI
- [ ] Написать интеграционные тесты
- [ ] Документировать API
- [ ] Создать PR с подробным описанием
- [ ] Провести code review
- [ ] Deploy на staging и тестировать
- [ ] Merge в main

---

**Дата создания:** 2026-08-29  
**Последний update:** 2026-08-29  
**Автор:** Claude AI (Haiku 4.5)
