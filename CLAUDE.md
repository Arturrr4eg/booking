# Booking — заметки для Claude

Сервис онлайн-записи для мастеров и студий. Учебный проект: цель — набрать навыки
мидл-фронтенда (прод, CI/CD, Sentry, немного бэкенда) и уметь объяснить каждое решение на собесе.

## Как мы работаем

- Код пишет пользователь, Claude — ментор и ревьюер. Готовый код пишет, только когда попросили прямо.
- Объяснения на русском. Новая тема — подробно, с «зачем» и примерами из этого проекта.
  Знакомая тема или «коротко» — коротко.
- На ревью баги и безопасность чиним сразу. Производительность и «джуновские» маркеры фронта
  записываем в GitHub Issues с меткой `tech-debt` — для отдельных PR с замерами метрик.
- Тесты проверяем мутацией: сломай код — тест должен покраснеть.
- Закончили задачу и переходим к следующей (обычно в новой сессии) — Claude обновляет
  раздел «Где мы сейчас»: что сделали и какой следующий этап.

## Стек

- Монорепо pnpm workspaces: `apps/api`, `apps/web`. **Только pnpm**, npm запрещён (`.npmrc` + `engines`).
- `apps/api`: Fastify 5, Prisma 7 (`@prisma/adapter-pg`, клиент в `src/generated/prisma`), PostgreSQL 17
  в docker-compose, zod 4, argon2, JWT в HttpOnly-cookie `access_token` (15 мин) + refresh `refresh_token`, Vitest.
- `apps/web`: Next.js 16 (App Router, `cacheComponents`), React 19, Tailwind 4, react-hook-form + zod,
  Vitest (окружение `node`, конфиг `vitest.config.mts`, тесты `src/**/*.test.ts`).
  Структура по FSD: `app/` (страницы), `features/` (фичи), `shared/` (api, config, ui).
  Браузер ходит в API через `rewrites`: `/api/*` → `API_URL`, чтобы cookie работали без CORS.

@apps/web/AGENTS.md

## Команды (из корня)

- `pnpm dev` — фронт (:3000) и API (:4000). Нужен запущенный Docker Desktop и `pnpm db:up`.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — то же, что CI.
- `pnpm format` — исправить форматирование.
- `pnpm --filter @booking/api db:migrate` — миграции; `db:generate` — после правки `schema.prisma`.
- Добавить зависимость: `pnpm --filter @booking/web add <пакет>`.

## Соглашения

- Ветка на фичу от свежего `main`, PR, CI, squash merge. Conventional Commits на русском:
  `feat: …`, `fix: …`, `chore: …`, `test: …`, `refactor: …`.
- API: `buildApp(options)` с зависимостями через параметры; тесты через `app.inject` и фейковую `db`.
  Тело запроса проверяется zod; наружу отдаётся только `toPublicUser`.
- Ответы API на фронте тоже проверяются zod-схемами (`shared/api`), запросы возвращают
  discriminated union (`{ ok: true, … } | { ok: false, kind: … }`), а не бросают исключения.
- В git только `.env.example`, никогда `.env`.
- `cacheComponents`: Next не размонтирует прошлые страницы, а прячет в `<Activity>` (до 3 маршрутов)
  вместе с состоянием и DOM. Формы с паролями сбрасывать в cleanup `useLayoutEffect`
  (`useLayoutEffect(() => reset, [reset])`), `id` полей — через `useId`, иначе дубли в DOM.
  Гайд: `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.

## Где мы сейчас

Актуальный план и долги — в GitHub Issues и открытых PR (`gh issue list`, `gh pr list`).

**Текущая задача — refresh-токены, вторая половина #18.** PR 1 (API, ветка `feat/refresh-token`)
открыт. Код PR 1 по просьбе пользователя написал Claude, с подробным разбором простыми словами.

Проблема: access-токен живёт 15 минут, после этого пользователь — гость и вводит пароль заново.
Решение: короткий access (JWT, 15 мин) + длинный refresh, которым фронт тихо получает новую пару.

Что сделано в PR 1 (API):

- Схема: `Session` = один вход (`expiresAt` — абсолютный потолок 90 дней, `revokedAt`,
  `revokedReason` `LOGOUT`/`REUSE`) и `RefreshToken` = звено ротации (`tokenHash @unique`,
  `expiresAt` — 30 дней, но не дольше сессии, `usedAt`). Миграция `session_rotation`.
- `auth/refresh-token.ts`: токен — 32 случайных байта base64url (не JWT), в БД SHA-256
  (не argon2: энтропия высокая, а детерминированный хэш нужен для поиска по `@unique`).
  Cookie `refresh_token` с `path: '/api/auth'` — путь, который видит браузер (rewrites Next).
- Вход: сессия и первый токен одной вложенной записью, cookie — после базы.
- `POST /auth/refresh` → `204` с новой парой. Любой отказ — `401` и стёртые обе cookie.
  Использованный токен старше `REUSE_GRACE_MS` (10 с) — кража: сессия `REUSE`, лог `warn`.
  В окне 10 с — новая пара (две вкладки с общей cookie). Порядок: новый токен → пометка старого
  (`updateMany` с `usedAt: null`, чтобы окно не сдвигалось).
- `POST /auth/logout`: один `session.updateMany` по `refreshTokens.some.tokenHash`, причина
  `LOGOUT`, потом стереть обе cookie; без cookie/сессии — всё равно `204`; база упала — `500`,
  cookie не тронуты.
- 58 тестов API, мутации убиты (12 + 22 + 8). Сценарий вход → refresh → logout → кража проверен
  curl'ом через `:3000` на настоящей базе.

**Следующий этап — PR 2, фронт** (после мержа PR 1, ветка от свежего `main`):

1. Обёртка над `fetch` в `shared/api`: 401 → один общий refresh → повтор исходного запроса.
   Single-flight: параллельные 401 в вкладке ждут один промис (между вкладками страхует окно 10 с).
   Сам `/auth/refresh` вернул 401 — не повторять, сообщить «сессия кончилась».
   `/auth/refresh` шлётся без тела и без `Content-Type`, иначе Fastify 400.
2. `AuthProvider`: сессия кончилась → `guest`. `getMe` идёт через обёртку.
3. Тесты обёртки по таблице ответов + single-flight (два параллельных 401 → один refresh), мутации.
4. Проверить в браузере: вход → удалить `access_token` в DevTools → F5 остаёмся вошедшими;
   удалить обе cookie → гость. После PR закрыть #18.

Долги: чистка протухших строк `RefreshToken`/`Session` (cron) — завести issue `tech-debt`.
Опционально: перепроверка `/me` по `visibilitychange`, экран «мои устройства» (`userAgent`).

Потом на выбор: проверка входа на сервере (#17), мемоизация контекста с замером (#16).
