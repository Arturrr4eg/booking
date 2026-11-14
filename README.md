# Booking

Сервис онлайн-записи для мастеров и студий: публичная страница записи и личный кабинет.

## Структура

```
apps/
  api/   бэкенд: Fastify, Prisma, PostgreSQL
  web/   фронтенд: Next.js (App Router), Tailwind
docker-compose.yml       локальная база
.github/workflows/ci.yml проверки на каждый PR
```

## Первый запуск

Нужны Node.js 22+, pnpm и запущенный Docker Desktop.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm --filter @booking/api db:migrate
pnpm dev
```

- фронт: http://localhost:3000
- API: http://localhost:4000/health

## Команды

| Команда                                 | Что делает                      |
| --------------------------------------- | ------------------------------- |
| `pnpm dev`                              | фронт и API в режиме разработки |
| `pnpm lint`                             | ESLint во всех приложениях      |
| `pnpm typecheck`                        | проверка типов                  |
| `pnpm test`                             | тесты                           |
| `pnpm build`                            | продакшен-сборка                |
| `pnpm format`                           | форматирование Prettier         |
| `pnpm db:up`                            | поднять PostgreSQL в Docker     |
| `pnpm --filter @booking/api db:migrate` | создать и применить миграцию    |
| `pnpm --filter @booking/api db:studio`  | посмотреть базу в браузере      |
