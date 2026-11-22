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
  в docker-compose, zod 4, argon2, JWT в HttpOnly-cookie `access_token` (15 мин), Vitest.
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

## Где мы сейчас

Актуальный план и долги — в GitHub Issues и открытых PR (`gh issue list`, `gh pr list`).

**Последняя задача — состояние авторизации на клиенте (ветка `feat/web-auth-state`).**
PR #15 (тесты клиентов API) смёржен, #12 закрыт.

- Сделано: `PublicUser` и `publicUserSchema` в одном месте, `shared/api/user.ts` (#13).
  `getMe` в `shared/api/me.ts`, 9 тестов, каждая из 9 мутаций роняет свой тест.
  `AuthProvider` в `features/auth/model`: состояние — union `loading | authenticated | guest | error`,
  действия `signIn` и `refresh`, номер запроса в `useRef` против гонки ответов.
  Форма входа вызывает `signIn`, на главной `HomeAuth` показывает все 4 состояния.
  Проверено в браузере: вход без перезагрузки, перезагрузка, API лежит → «Повторить».
- Формы входа и регистрации: `method="POST"` (до гидрации пароль уходил GET-ом в URL) и кнопка
  заблокирована `isSubmitting || isSubmitSuccessful` — раньше после успеха она снова включалась,
  пока шёл `router.push`. Проверено в браузере с замедленным fetch.
- Состояние: открыт PR из `feat/web-auth-state` с `Closes #13` (`gh pr list`). Дальше — CI зелёный,
  squash merge, `git switch main && git pull`.

**Следующий этап — выход из аккаунта (#18).** Ветка `feat/logout` от свежего `main`.
Код пишет пользователь, Claude ведёт по шагам и ревьюит.

1. API, `apps/api/src/routes/auth.ts`: `POST /auth/logout` → `reply.clearCookie('access_token', …)`
   с теми же `path`, `httpOnly`, `sameSite`, `secure`, что в `/auth/login`, ответ `204`.
   Обсудить: нужен ли `authenticate` (выход без cookie — ошибка или просто 204?).
   Тесты через `app.inject`: в ответе `set-cookie` с истёкшей cookie; без cookie тоже 204.
2. Фронт, `shared/api/logout.ts`: `postLogout()` → `{ ok: true } | { ok: false, kind: 'unknown' }`,
   экспорт из `shared/api/index.ts`, тесты по таблице ответов + мутации (как `me.test.ts`).
3. `features/auth/model`: `signOut()` в `AuthContextValue` и `AuthProvider` — вызвать `postLogout`,
   при успехе сдвинуть `requestIdRef` и поставить `guest`. Обсудить, что показывать, если выход не удался.
4. `app/home-auth.tsx`: кнопка «Выйти» в состоянии `authenticated`.
5. Проверить в браузере: вход → выход → F5 остаётся гостем (cookie правда удалена).
6. Вторая половина #18 — истечение токена (15 мин): при 401 от защищённых запросов переводить
   состояние в `guest`. Можно отдельным PR.

Потом на выбор: проверка входа на сервере (#17), мемоизация контекста с замером (#16).
