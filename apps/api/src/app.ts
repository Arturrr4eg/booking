import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
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

  await app.register(cors, { origin: webOrigin, credentials: true });
  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: '15m' },
    cookie: { cookieName: 'access_token', signed: false },
  });
  await app.register(fastifyCookie);

  // Обработчик ставится до роутов: Fastify запоминает его в момент регистрации роута.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // 4xx — ошибки клиента (кривой JSON, слишком большое тело): их текст безопасен
    // и помогает понять, что не так с запросом.
    if (statusCode < 500) {
      return reply.status(statusCode).send(error);
    }

    // 5xx — наша ошибка. Подробности (стек, пути к файлам, текст от Prisma) уходят
    // только в лог, клиенту — общая фраза.
    request.log.error({ err: error }, 'Необработанная ошибка');
    return reply.status(500).send({ error: 'Internal Server Error' });
  });

  healthRoutes(app, { db });
  authRoutes(app, { db, isProduction });

  return app;
}
