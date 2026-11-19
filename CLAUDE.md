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

## Стек

- Монорепо pnpm workspaces: `apps/api`, `apps/web`. **Только pnpm**, npm запрещён (`.npmrc` + `engines`).
- `apps/api`: Fastify 5, Prisma 7 (`@prisma/adapter-pg`, клиент в `src/generated/prisma`), PostgreSQL 17
  в docker-compose, zod 4, argon2, JWT в HttpOnly-cookie `access_token` (15 мин), Vitest.
- `apps/web`: Next.js 16 (App Router, `cacheComponents`), React 19, Tailwind 4, react-hook-form + zod.
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
