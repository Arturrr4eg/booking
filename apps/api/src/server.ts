import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = await buildApp({
  db,
  webOrigin: config.WEB_ORIGIN,
  logger: true,
  jwtSecret: config.JWT_SECRET,
  isProduction: config.NODE_ENV === 'production',
});

// Graceful shutdown: при деплое контейнер получает SIGTERM. Доделываем текущие
// запросы и закрываем соединения с базой, а не обрываем их на полуслове.
async function shutdown(signal: string) {
  app.log.info(`Получен ${signal}, останавливаемся`);
  await app.close();
  await db.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
