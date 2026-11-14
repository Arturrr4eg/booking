import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma CLI сам .env не читает. В CI и на проде переменные приходят из окружения,
// поэтому файл подгружаем, только если он есть.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
