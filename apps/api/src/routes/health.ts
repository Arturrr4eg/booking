import type { FastifyInstance } from 'fastify';

// Минимум, который нужен health-роутам от базы. Узкий тип вместо всего PrismaClient
// позволяет подставить в тестах заглушку без поднятого Postgres.
export interface HealthDeps {
  db: { $queryRaw: (query: TemplateStringsArray) => PromiseLike<unknown> };
}

export function healthRoutes(app: FastifyInstance, { db }: HealthDeps) {
  // Liveness: процесс жив. Базу не трогаем, иначе при её падении
  // оркестратор начнёт перезапускать здоровый сервис.
  app.get('/health', () => ({ status: 'ok' }));

  // Readiness: сервис готов принимать трафик, то есть база доступна.
  app.get('/health/ready', async (request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      request.log.error({ err: error }, 'База недоступна');
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  app.get('/health/version', () => ({ version: '0.0.0' }));
}
