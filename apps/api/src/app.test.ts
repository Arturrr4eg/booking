import { describe, expect, it, vi, afterEach } from 'vitest';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppOptions } from './app.js';

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

function createDbWithUser() {
  const db = createFakeDb();
  db.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'ivan@mail.ru',
    name: 'Иван',
    passwordHash: 'hash',
  });
  return db;
}

function buildTestApp(db: ReturnType<typeof createFakeDb>, options: Partial<AppOptions> = {}) {
  return buildApp({
    webOrigin,
    db,
    jwtSecret: 'test-secret-at-least-32-characters-long',
    ...options,
  });
}

const webOrigin = 'http://localhost:3000';

describe('health', () => {
  it('GET /health отвечает 200 без обращения к базе', async () => {
    const db = createFakeDb();

    const app = await buildTestApp(db);

    // inject выполняет запрос внутри процесса, без открытия порта.
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('GET /health/ready отвечает 200, когда база доступна', async () => {
    const db = createFakeDb();

    const app = await buildTestApp(db);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
  });

  it('GET /health/ready отвечает 503, когда база недоступна', async () => {
    const db = createFakeDb();
    db.$queryRaw.mockRejectedValue(new Error('Ошибка подключения к базе'));
    const app = await buildTestApp(db);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
  });

  it('GET /health/version Отвечает 200', async () => {
    const db = createFakeDb();
    const app = await buildTestApp(db);

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

    const app = await buildTestApp(db);

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

    const app = await buildTestApp(db);

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

    const app = await buildTestApp(db);

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

    const app = await buildTestApp(db);

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
    const app = await buildTestApp(db);

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

describe('POST /auth/login', () => {
  const password = 'password123';

  async function createDbWithUser() {
    const db = createFakeDb();
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ivan@mail.ru',
      name: 'Иван',
      passwordHash: await argon2.hash(password),
    });
    return db;
  }

  function login(app: FastifyInstance, payload: object) {
    return app.inject({ method: 'POST', url: '/auth/login', payload });
  }

  // JWT — три части через точку, средняя — данные в base64url.
  function decodeJwtPayload(token: string) {
    const payload = token.split('.')[1] ?? '';
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  }

  it('возвращает пользователя без хэша пароля', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    const response = await login(app, { email: 'ivan@mail.ru', password });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'user-1', email: 'ivan@mail.ru', name: 'Иван' });
  });

  it('выставляет cookie access_token с защитными флагами', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    const response = await login(app, { email: 'ivan@mail.ru', password });

    const cookie = response.cookies.find((c) => c.name === 'access_token');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 900 });

    expect(cookie).not.toHaveProperty('secure');
  });

  it('кладёт в токен id пользователя и срок жизни 15 минут', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    const response = await login(app, { email: 'ivan@mail.ru', password });

    const cookie = response.cookies.find((c) => c.name === 'access_token');
    const payload = decodeJwtPayload(cookie?.value ?? '');
    expect(payload.sub).toBe('user-1');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('ставит cookie флаг Secure в production', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db, { isProduction: true });

    const response = await login(app, { email: 'ivan@mail.ru', password });

    const cookie = response.cookies.find((c) => c.name === 'access_token');
    expect(cookie).toMatchObject({ secure: true });
  });

  it('отвечает 401 без cookie, если пароль неверный', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    const response = await login(app, { email: 'ivan@mail.ru', password: 'wrong-password' });

    expect(response.statusCode).toBe(401);
    expect(response.cookies).toEqual([]);
  });

  it('отвечает 401 без cookie, если email не зарегистрирован', async () => {
    const db = createFakeDb();
    const app = await buildTestApp(db);

    const response = await login(app, { email: 'nobody@mail.ru', password });

    expect(response.statusCode).toBe(401);
    expect(response.cookies).toEqual([]);
  });

  it('не даёт отличить неверный пароль от незарегистрированного email', async () => {
    const appWithUser = await buildTestApp(await createDbWithUser());
    const appWithoutUser = await buildTestApp(createFakeDb());

    const wrongPassword = await login(appWithUser, { email: 'ivan@mail.ru', password: 'wrong' });
    const unknownEmail = await login(appWithoutUser, { email: 'ivan@mail.ru', password: 'wrong' });

    expect(wrongPassword.statusCode).toBe(unknownEmail.statusCode);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it('отвечает 400 и не ходит в базу, если тело невалидно', async () => {
    const db = createFakeDb();
    const app = await buildTestApp(db);

    const response = await login(app, { email: 'ivanmail.ru', password });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.fieldErrors).toHaveProperty('email');
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(response.cookies).toEqual([]);
  });

  it('ищет пользователя по нормализованному email', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    const response = await login(app, { email: '  Ivan@Mail.RU  ', password });

    expect(response.statusCode).toBe(200);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ivan@mail.ru' } });
  });
});
describe('GET /auth/me', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('401 если отсутствует куки', async () => {
    const db = createDbWithUser();
    const app = await buildTestApp(db);
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('401 если невалидный токен', async () => {
    const db = createDbWithUser();
    const app = await buildTestApp(db);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { access_token: 'abc' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it('401 если токен другого приложения', async () => {
    const db = createDbWithUser();
    const app = await buildTestApp(db);
    const otherApp = await buildTestApp(createFakeDb(), {
      jwtSecret: 'another-secret-at-least-32-characters',
    });
    const forged = otherApp.jwt.sign({ sub: 'user-1' });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { access_token: forged },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('401 если истекший токен', async () => {
    const db = createDbWithUser();
    const app = await buildTestApp(db);
    const token = app.jwt.sign({ sub: 'user-1' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { access_token: token },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('200 если валидный токен', async () => {
    const db = createDbWithUser();
    const app = await buildTestApp(db);
    const token = app.jwt.sign({ sub: 'user-1' });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { access_token: token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'user-1', email: 'ivan@mail.ru', name: 'Иван' });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('401 если пользователь был удален', async () => {
    const db = createFakeDb();
    const app = await buildTestApp(db);
    const token = app.jwt.sign({ sub: 'user-1' });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { access_token: token },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});
