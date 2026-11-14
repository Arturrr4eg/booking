import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const webOrigin = 'http://localhost:3000';

describe('health', () => {
  it('GET /health отвечает 200 без обращения к базе', async () => {
    const app = await buildApp({
      webOrigin,
      db: { $queryRaw: () => Promise.reject(new Error('база не должна вызываться')) },
    });

    // inject выполняет запрос внутри процесса, без открытия порта.
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready отвечает 200, когда база доступна', async () => {
    const app = await buildApp({ webOrigin, db: { $queryRaw: () => Promise.resolve([1]) } });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
  });

  it('GET /health/ready отвечает 503, когда база недоступна', async () => {
    const app = await buildApp({
      webOrigin,
      db: { $queryRaw: () => Promise.reject(new Error('connection refused')) },
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
  });

  it('GET /health/version Отвечает 200', async () => {
    const app = await buildApp({
      webOrigin,
      db: { $queryRaw: () => Promise.reject(new Error('база не должна вызываться')) },
    });

    // inject выполняет запрос внутри процесса, без открытия порта.
    const response = await app.inject({ method: 'GET', url: '/health/version' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: '0.0.0' });
  });
});
