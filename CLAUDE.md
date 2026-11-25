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

**Последняя задача — проверка входа на сервере (#17 закрыт, PR #24 смёржен).** Код по
просьбе пользователя писал Claude, с подробным разбором. Кратко:

- `shared/api/server-me.ts` (`server-only`): `getServerMe()` читает `access_token` из `cookies()`,
  ходит в `${API_URL}/auth/me` только с этой cookie, таймаут 2 с. Исходов два: `{ ok: true, user }`
  или `{ ok: false, kind: 'unknown' }` — без `refresh_token` (его `path` — `/api/auth`) сервер не
  может сказать «не вошёл», решает клиент через `authFetch`.
- Корневой layout вызывает `getServerMe()` **без await** и отдаёт промис в `Providers` → `AuthProvider`.
  В контексте `serverMe` (промис) + `clientState` (вход/выход/клиентский `/me`, `null` — ничего).
  `useAuthState()` — «кто свежее, тот прав»: `clientState` важнее сервера; `use(serverMe)` подвешивает,
  поэтому только под `Suspense`. `useAuth()` — действия, не подвисает. Клиентский `/me` — только при «не знаю».
- На главной `Suspense` вокруг `HomeAuth` с `fallback={null}` и `min-h-13`: текстовая заглушка
  мелькала, потому что оболочка рисуется раньше, чем доходит потоковый кусок с именем.
- Замер (прод, Fast 4G + CPU 4×, медиана из 5, Element Timing `elementtiming="user-name"`):
  имя 824 → 704 мс, LCP 344 → 332 мс. Остаток ~370 мс — намеренная задержка React 19 при показе
  Suspense-границ (~300 мс). Локальный прод-запуск API: `pnpm --filter @booking/api exec node --env-file=.env dist/server.js`.
- Компромисс: из-за промиса в корневом layout все страницы ◐, `/login` и `/register` тоже ходят в `/auth/me`.

Долги (отложены, пока нет основного функционала): маркер сессии (#23), чистка протухших
`RefreshToken`/`Session` (#25), мемоизация контекста (#16) — мерить, когда появятся экраны со
списками. Rate limiting логина (#9) — обязательно до первого публичного деплоя.

**Следующий этап — сквозной срез записи** (выбран вместо полировки авторизации): самый короткий
путь клиента от публичной страницы до записи, кабинета мастера пока нет, данные из seed. Issues
по порядку, каждый — отдельная ветка и PR:

1. #26 — публичный API бизнеса (`GET /businesses/:slug`) и seed демо-данных;
2. #27 — страница `/b/[slug]` с `'use cache'` + `cacheTag`;
3. #28 — расчёт свободных слотов в таймзоне бизнеса (чистая функция + маршрут);
4. #29 — создание записи с защитой от двойной записи (гонка, `409`);
5. #30 — форма записи на публичной странице.

Потом кабинет мастера (бизнес, услуги, часы работы, сброс `cacheTag`), потом #9 и деплой.
Начинать с #26 от свежего `main`. Кто пишет код — спросить в начале сессии
(по умолчанию пользователь).
