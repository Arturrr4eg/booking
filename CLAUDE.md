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

**Последняя задача — refresh-токены, вторая половина #18.** PR #21 (API) смёржен, PR 2 (фронт,
ветка `feat/web-refresh`) открыт и закрывает #18. Код обоих PR по просьбе пользователя написал
Claude, с подробным разбором простыми словами.

Проблема: access-токен живёт 15 минут, после этого пользователь — гость и вводит пароль заново.
Решение: короткий access (JWT, 15 мин) + длинный refresh, которым фронт тихо получает новую пару.

API (#21):

- Схема: `Session` = один вход (`expiresAt` — абсолютный потолок 90 дней, `revokedAt`,
  `revokedReason` `LOGOUT`/`REUSE`) и `RefreshToken` = звено ротации (`tokenHash @unique`,
  `expiresAt` — 30 дней, но не дольше сессии, `usedAt`).
- `auth/refresh-token.ts`: токен — 32 случайных байта base64url (не JWT), в БД SHA-256.
  Cookie `refresh_token` с `path: '/api/auth'` — путь, который видит браузер (rewrites Next).
- `POST /auth/refresh` → `204` с новой парой; любой отказ — `401` и стёртые обе cookie.
  Использованный токен старше 10 с — кража: сессия `REUSE`. В окне 10 с — новая пара
  (вкладки с общей cookie).
- `POST /auth/logout`: закрыть сессию (`LOGOUT`), стереть обе cookie, идемпотентен.

Фронт (PR 2):

- `authFetch` в `shared/api/auth-fetch.ts` — замена `fetch` для защищённых запросов: 401 →
  общий refresh (single-flight, промис на уровне модуля, только браузер) → один повтор.
  Refresh `401` → отдаёт исходный 401 («не вошёл»); сеть/500/не-204 → бросает (`unknown`, не
  `guest`). Не для login/register/logout: там 401 — неверный пароль.
- `getMe` через `authFetch`; `AuthProvider` без изменений (`unauthorized` → `guest`).
- 15 тестов обёртки + 3 сквозных в `me.test.ts`, 15 мутаций убиты.
- Проверено в браузере с настоящим протуханием (16 мин): F5 → `/me` 401 ×2 (StrictMode) →
  один refresh 204 → `/me` 200 ×2, остаёмся вошедшими. Выход → F5 → гость.

Долги: чистка протухших строк `RefreshToken`/`Session` (cron) — завести issue `tech-debt`.
Опционально: перепроверка `/me` по `visibilitychange`, экран «мои устройства» (`userAgent`).

**Следующий этап на выбор:** проверка входа на сервере (#17), мемоизация контекста с замером (#16).
