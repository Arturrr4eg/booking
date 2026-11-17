import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes, type HealthDeps } from './routes/health.js';
import { authRoutes, type AuthDeps } from './routes/auth.js';
import fastifyCookie from '@fastify/cookie';

export interface AppOptions {
  db: HealthDeps['db'] & AuthDeps['db'];
  webOrigin: string;
  logger?: boolean;
  jwtSecret: string;
  isProduction?: boolean;
}

// Приложение собирается функцией, а не на уровне модуля: тесты создают свой
// экземпляр с заглушками, а server.ts — боевой, с настоящей базой.
export async function buildApp({
  db,
  webOrigin,
  logger = false,
  jwtSecret,
  isProduction = false,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  // credentials: true понадобится, когда появится авторизация через cookies.
  await app.register(cors, { origin: webOrigin, credentials: true });
  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: '15m' },
    cookie: { cookieName: 'access_token', signed: false },
  });
  await app.register(fastifyCookie);

  healthRoutes(app, { db });
  authRoutes(app, { db, isProduction });

  return app;
}
