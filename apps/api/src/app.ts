import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes, type HealthDeps } from './routes/health.js';

export interface AppOptions {
  db: HealthDeps['db'];
  webOrigin: string;
  logger?: boolean;
}

// Приложение собирается функцией, а не на уровне модуля: тесты создают свой
// экземпляр с заглушками, а server.ts — боевой, с настоящей базой.
export async function buildApp({
  db,
  webOrigin,
  logger = false,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  // credentials: true понадобится, когда появится авторизация через cookies.
  await app.register(cors, { origin: webOrigin, credentials: true });

  healthRoutes(app, { db });

  return app;
}
