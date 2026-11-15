import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

function createFakeDb() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([1]),
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'ivan@mail.ru',
        name: 'Иван',
        passwordHash: 'hash',
      }),
    },
  };
}

const webOrigin = 'http://localhost:3000';

describe('health', () => {
  it('GET /health отвечает 200 без обращения к базе', async () => {
    const db = createFakeDb();

    const app = await buildApp({
      webOrigin,
      db,
    });

    // inject выполняет запрос внутри процесса, без открытия порта.
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('GET /health/ready отвечает 200, когда база доступна', async () => {
    const db = createFakeDb();

    const app = await buildApp({ webOrigin, db });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
  });

  it('GET /health/ready отвечает 503, когда база недоступна', async () => {
    const db = createFakeDb();
    db.$queryRaw.mockRejectedValue(new Error('Ошибка подключения к базе'));
    const app = await buildApp({
      webOrigin,
      db,
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
  });

  it('GET /health/version Отвечает 200', async () => {
    const db = createFakeDb();
    const app = await buildApp({
      webOrigin,
      db,
    });

    // inject выполняет запрос внутри процесса, без открытия порта.
    const response = await app.inject({ method: 'GET', url: '/health/version' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: '0.0.0' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('POST /auth/register', () => {
  it('Успешная регистрация', async () => {
    const db = createFakeDb();
    db.user.create.mockResolvedValue({
      id: 'abc-123',
      email: 'ivan@mail.ru',
      name: 'Иван',
      passwordHash: 'hash',
    });

    const app = await buildApp({ webOrigin, db });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ivan@mail.ru', name: 'Иван', password: '348328334' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 'abc-123', email: 'ivan@mail.ru', name: 'Иван' });

    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        email: 'ivan@mail.ru',
        name: 'Иван',
        passwordHash: expect.stringMatching(/^\$argon2/),
      },
    });
  });

  it('Невалидный email', async () => {
    const db = createFakeDb();

    const app = await buildApp({ webOrigin, db });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ivanmail.ru', name: 'Иван', password: '348328334' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.fieldErrors).toHaveProperty('email');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('Короткий пароль', async () => {
    const db = createFakeDb();

    const app = await buildApp({ webOrigin, db });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ivan@mail.ru', name: 'Иван', password: '3483' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.fieldErrors).toHaveProperty('password');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('Занятый email', async () => {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    const app = await buildApp({ webOrigin, db });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ivan@mail.ru', name: 'Иван', password: '348328334' },
    });

    expect(response.statusCode).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('приводит email к нижнему регистру и обрезает пробелы', async () => {
    const db = createFakeDb();
    const app = await buildApp({ webOrigin, db });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: '  Ivan@Mail.RU  ', name: 'Иван', password: '348328334' },
    });

    expect(response.statusCode).toBe(201);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ivan@mail.ru' } });
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'ivan@mail.ru' }),
    });
  });
});
