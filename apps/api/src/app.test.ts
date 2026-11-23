import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
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
    session: {
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'token-2' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

describe('POST /auth/login: refresh-токен', () => {
  const password = 'password123';
  const DAY_MS = 24 * 60 * 60 * 1000;

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

  function login(app: FastifyInstance, headers: Record<string, string> = {}) {
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ivan@mail.ru', password },
      headers,
    });
  }

  function findRefreshCookie(response: Awaited<ReturnType<typeof login>>) {
    return response.cookies.find((c) => c.name === 'refresh_token');
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('выставляет cookie refresh_token на путь /api/auth на 30 дней', async () => {
    const app = await buildTestApp(await createDbWithUser());

    const response = await login(app);

    const cookie = findRefreshCookie(response);
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(cookie).not.toHaveProperty('secure');
  });

  it('ставит refresh-cookie флаг Secure в production', async () => {
    const app = await buildTestApp(await createDbWithUser(), { isProduction: true });

    const response = await login(app);

    expect(findRefreshCookie(response)).toMatchObject({ secure: true });
  });

  it('создаёт сессию на 90 дней и первый токен на 30, в базе только хэш', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-01-01T10:00:00Z');
    vi.setSystemTime(now);
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    const response = await login(app, { 'user-agent': 'Chrome on Windows' });

    const token = findRefreshCookie(response)?.value ?? '';
    const expectedHash = createHash('sha256').update(token).digest('hex');
    expect(db.session.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        userAgent: 'Chrome on Windows',
        expiresAt: new Date(now.getTime() + 90 * DAY_MS),
        refreshTokens: {
          create: {
            tokenHash: expectedHash,
            expiresAt: new Date(now.getTime() + 30 * DAY_MS),
          },
        },
      },
    });
    expect(expectedHash).not.toBe(token);
  });

  it('обрезает слишком длинный User-Agent', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    await login(app, { 'user-agent': 'x'.repeat(2000) });

    const data = db.session.create.mock.calls[0]?.[0].data;
    expect(data.userAgent).toHaveLength(512);
  });

  it('каждый вход выдаёт новый случайный токен длиной 256 бит', async () => {
    const app = await buildTestApp(await createDbWithUser());

    const first = findRefreshCookie(await login(app))?.value;
    const second = findRefreshCookie(await login(app))?.value;

    // 32 байта в base64url без паддинга = 43 символа.
    expect(first).toMatch(/^[\w-]{43}$/);
    expect(second).toMatch(/^[\w-]{43}$/);
    expect(first).not.toBe(second);
  });

  it('не создаёт сессию при неверном пароле', async () => {
    const db = await createDbWithUser();
    const app = await buildTestApp(db);

    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ivan@mail.ru', password: 'wrong-password' },
    });

    expect(db.session.create).not.toHaveBeenCalled();
  });

  it('не ставит cookie, если сессию не удалось сохранить', async () => {
    const db = await createDbWithUser();
    db.session.create.mockRejectedValue(new Error('connection lost'));
    const app = await buildTestApp(db);

    const response = await login(app);

    expect(response.statusCode).toBe(500);
    expect(response.cookies).toEqual([]);
  });
});

describe('POST /auth/refresh', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const NOW = new Date('2026-03-01T12:00:00Z');
  const OLD_TOKEN = 'old-refresh-token';

  function sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  // Строка RefreshToken вместе с сессией — то, что вернёт findUnique с include.
  function storedToken(
    token: { usedAt?: Date | null; expiresAt?: Date } = {},
    session: { revokedAt?: Date | null; expiresAt?: Date } = {},
  ) {
    return {
      id: 'token-1',
      sessionId: 'session-1',
      tokenHash: sha256(OLD_TOKEN),
      expiresAt: new Date(NOW.getTime() + 20 * DAY_MS),
      usedAt: null,
      createdAt: new Date(NOW.getTime() - 10 * DAY_MS),
      ...token,
      session: {
        id: 'session-1',
        userId: 'user-1',
        userAgent: null,
        expiresAt: new Date(NOW.getTime() + 60 * DAY_MS),
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(NOW.getTime() - 30 * DAY_MS),
        ...session,
      },
    };
  }

  function dbWithToken(...args: Parameters<typeof storedToken>) {
    const db = createFakeDb();
    db.refreshToken.findUnique.mockResolvedValue(storedToken(...args));
    return db;
  }

  function refresh(app: FastifyInstance, cookies: Record<string, string> = {}) {
    return app.inject({ method: 'POST', url: '/auth/refresh', cookies });
  }

  function cookie(response: Awaited<ReturnType<typeof refresh>>, name: string) {
    return response.cookies.find((c) => c.name === name);
  }

  // Отказ: 401 и обе cookie стёрты (пустое значение), новых токенов нет.
  function expectRejected(response: Awaited<ReturnType<typeof refresh>>) {
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(cookie(response, 'access_token')).toMatchObject({ value: '', path: '/' });
    expect(cookie(response, 'refresh_token')).toMatchObject({ value: '', path: '/api/auth' });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('успешная ротация', () => {
    it('204, новая пара cookie, токен другой', async () => {
      const app = await buildTestApp(dbWithToken());

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      const newRefresh = cookie(response, 'refresh_token');
      expect(newRefresh?.value).toMatch(/^[\w-]{43}$/);
      expect(newRefresh?.value).not.toBe(OLD_TOKEN);
      expect(newRefresh).toMatchObject({ path: '/api/auth', httpOnly: true, sameSite: 'Lax' });
    });

    it('новый access-токен выдан владельцу сессии', async () => {
      const app = await buildTestApp(dbWithToken());

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      const accessToken = cookie(response, 'access_token')?.value ?? '';
      expect(app.jwt.verify<{ sub: string }>(accessToken).sub).toBe('user-1');
      expect(cookie(response, 'access_token')).toMatchObject({ maxAge: 900 });
    });

    it('ищет токен по хэшу, а не по самому токену', async () => {
      const db = dbWithToken();
      const app = await buildTestApp(db);

      await refresh(app, { refresh_token: OLD_TOKEN });

      expect(db.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256(OLD_TOKEN) },
        include: { session: true },
      });
    });

    it('сохраняет хэш нового токена в той же сессии на 30 дней', async () => {
      const db = dbWithToken();
      const app = await buildTestApp(db);

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      const newToken = cookie(response, 'refresh_token')?.value ?? '';
      expect(db.refreshToken.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          tokenHash: sha256(newToken),
          expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
        },
      });
      expect(cookie(response, 'refresh_token')).toMatchObject({ maxAge: 30 * 24 * 60 * 60 });
    });

    it('помечает старый токен использованным, не перезаписывая прежнюю отметку', async () => {
      const db = dbWithToken();
      const app = await buildTestApp(db);

      await refresh(app, { refresh_token: OLD_TOKEN });

      expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'token-1', usedAt: null },
        data: { usedAt: NOW },
      });
      expect(db.session.updateMany).not.toHaveBeenCalled();
    });

    it('новый токен не переживает сессию', async () => {
      const sessionExpiresAt = new Date(NOW.getTime() + 5 * DAY_MS);
      const db = dbWithToken({}, { expiresAt: sessionExpiresAt });
      const app = await buildTestApp(db);

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      expect(db.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ expiresAt: sessionExpiresAt }),
      });
      expect(cookie(response, 'refresh_token')).toMatchObject({ maxAge: 5 * 24 * 60 * 60 });
    });

    it('Secure в production', async () => {
      const app = await buildTestApp(dbWithToken(), { isProduction: true });

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      expect(cookie(response, 'refresh_token')).toMatchObject({ secure: true });
      expect(cookie(response, 'access_token')).toMatchObject({ secure: true });
    });
  });

  describe('отказ — 401 и стёртые cookie', () => {
    it('нет cookie — не ходит в базу', async () => {
      const db = createFakeDb();
      const app = await buildTestApp(db);

      const response = await refresh(app);

      expectRejected(response);
      expect(db.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('неизвестный токен', async () => {
      const db = createFakeDb();
      const app = await buildTestApp(db);

      const response = await refresh(app, { refresh_token: 'forged' });

      expectRejected(response);
      expect(db.refreshToken.create).not.toHaveBeenCalled();
    });

    it.each([
      ['токен протух', { expiresAt: NOW }, {}],
      ['сессия протухла', {}, { expiresAt: NOW }],
      ['сессия отозвана', {}, { revokedAt: new Date(NOW.getTime() - DAY_MS) }],
    ])('%s', async (_name, token, session) => {
      const db = dbWithToken(token, session);
      const app = await buildTestApp(db);

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      expectRejected(response);
      expect(db.refreshToken.create).not.toHaveBeenCalled();
      expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('повторное использование', () => {
    it('старый использованный токен — кража: отзывает сессию с причиной REUSE', async () => {
      const db = dbWithToken({ usedAt: new Date(NOW.getTime() - DAY_MS) });
      const app = await buildTestApp(db);

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      expectRejected(response);
      expect(db.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', revokedAt: null },
        data: { revokedAt: NOW, revokedReason: 'REUSE' },
      });
      expect(db.refreshToken.create).not.toHaveBeenCalled();
    });

    it('ровно 10 секунд — уже кража', async () => {
      const db = dbWithToken({ usedAt: new Date(NOW.getTime() - 10_000) });
      const app = await buildTestApp(db);

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      expectRejected(response);
      expect(db.session.updateMany).toHaveBeenCalled();
    });

    it('повтор в первые 10 секунд (вторая вкладка) — выдаёт новую пару', async () => {
      const db = dbWithToken({ usedAt: new Date(NOW.getTime() - 9_999) });
      const app = await buildTestApp(db);

      const response = await refresh(app, { refresh_token: OLD_TOKEN });

      expect(response.statusCode).toBe(204);
      expect(cookie(response, 'refresh_token')?.value).toMatch(/^[\w-]{43}$/);
      expect(db.session.updateMany).not.toHaveBeenCalled();
    });
  });

  it('база упала при записи нового токена — старый не помечен, cookie не выданы', async () => {
    const db = dbWithToken();
    db.refreshToken.create.mockRejectedValue(new Error('connection lost'));
    const app = await buildTestApp(db);

    const response = await refresh(app, { refresh_token: OLD_TOKEN });

    expect(response.statusCode).toBe(500);
    expect(response.cookies).toEqual([]);
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
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

describe('POST /auth/logout', () => {
  function logout(app: FastifyInstance, cookies?: Record<string, string>) {
    return app.inject({ method: 'POST', url: '/auth/logout', cookies });
  }

  it('204 с пустым телом, даже без cookie', async () => {
    const app = await buildTestApp(createFakeDb());

    const response = await logout(app);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('204 только с access-токеном и не ходит в БД', async () => {
    const db = createDbWithUser();
    const app = await buildTestApp(db);
    const token = app.jwt.sign({ sub: 'user-1' });

    const response = await logout(app, { access_token: token });

    expect(response.statusCode).toBe(204);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.session.updateMany).not.toHaveBeenCalled();
  });

  it('закрывает сессию по хэшу refresh-токена с причиной LOGOUT', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-03-01T12:00:00Z');
    vi.setSystemTime(now);
    const db = createFakeDb();
    const app = await buildTestApp(db);

    const response = await logout(app, { refresh_token: 'my-refresh-token' });
    vi.useRealTimers();

    expect(response.statusCode).toBe(204);
    expect(db.session.updateMany).toHaveBeenCalledWith({
      where: {
        revokedAt: null,
        refreshTokens: {
          some: { tokenHash: createHash('sha256').update('my-refresh-token').digest('hex') },
        },
      },
      data: { revokedAt: now, revokedReason: 'LOGOUT' },
    });
  });

  it('204, даже если сессия не найдена или уже закрыта', async () => {
    const db = createFakeDb();
    db.session.updateMany.mockResolvedValue({ count: 0 });
    const app = await buildTestApp(db);

    const response = await logout(app, { refresh_token: 'unknown' });

    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((c) => c.name === 'refresh_token')).toMatchObject({ value: '' });
  });

  it('удаляет cookie refresh_token с теми же атрибутами, что при входе', async () => {
    const app = await buildTestApp(createFakeDb());

    const response = await logout(app, { refresh_token: 'my-refresh-token' });

    const cookie = response.cookies.find((c) => c.name === 'refresh_token');
    expect(cookie).toMatchObject({
      value: '',
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 0,
      expires: new Date(0),
    });
    expect(cookie).not.toHaveProperty('secure');
  });

  it('база упала — 500, cookie не тронуты, пользователь остаётся вошедшим', async () => {
    const db = createFakeDb();
    db.session.updateMany.mockRejectedValue(new Error('connection lost'));
    const app = await buildTestApp(db);

    const response = await logout(app, { refresh_token: 'my-refresh-token' });

    expect(response.statusCode).toBe(500);
    expect(response.cookies).toEqual([]);
  });

  it('204 с битым токеном — протухшую cookie тоже надо удалить', async () => {
    const app = await buildTestApp(createFakeDb());

    const response = await logout(app, { access_token: 'abc' });

    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((c) => c.name === 'access_token')).toMatchObject({ value: '' });
  });

  it('удаляет cookie access_token с теми же атрибутами, что при входе', async () => {
    const app = await buildTestApp(createFakeDb());

    const response = await logout(app);

    const cookie = response.cookies.find((c) => c.name === 'access_token');
    expect(cookie).toMatchObject({
      value: '',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 0,
      expires: new Date(0),
    });
    expect(cookie).not.toHaveProperty('secure');
  });

  it('ставит флаг Secure в production', async () => {
    const app = await buildTestApp(createFakeDb(), { isProduction: true });

    const response = await logout(app);

    expect(response.cookies.find((c) => c.name === 'access_token')).toMatchObject({
      secure: true,
    });
    expect(response.cookies.find((c) => c.name === 'refresh_token')).toMatchObject({
      secure: true,
    });
  });
});

describe('обработка ошибок', () => {
  it('500 не раскрывает подробности внутренней ошибки', async () => {
    const db = createFakeDb();
    db.user.findUnique.mockRejectedValue(
      new Error('Invalid `db.user.findUnique()` invocation in C:/secret/auth.ts:36:32'),
    );
    const app = await buildTestApp(db);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ivan@mail.ru', password: 'password-123', name: 'Иван' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal Server Error' });
    expect(response.body).not.toContain('findUnique');
  });

  it('ошибка клиента (кривой JSON) по-прежнему отвечает 400 с пояснением', async () => {
    const app = await buildTestApp(createFakeDb());

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{ не json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('message');
  });
});
