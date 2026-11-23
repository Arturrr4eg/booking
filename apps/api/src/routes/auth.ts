import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import z from 'zod';
import argon2 from 'argon2';
import { authenticate } from '../auth/authenticate.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookie,
  refreshTokenExpiresAt,
  REUSE_GRACE_MS,
  SESSION_TTL_MS,
} from '../auth/refresh-token.js';

export interface AuthDeps {
  db: {
    user: Pick<PrismaClient['user'], 'findUnique' | 'create'>;
    session: Pick<PrismaClient['session'], 'create' | 'updateMany'>;
    refreshToken: Pick<PrismaClient['refreshToken'], 'findUnique' | 'create' | 'updateMany'>;
  };
  isProduction: boolean;
}

// Длинные User-Agent бывают у ботов; в БД кладём разумный кусок.
const USER_AGENT_MAX_LENGTH = 512;

// Атрибуты, по которым браузер узнаёт cookie. Вход и выход обязаны передавать одинаковые,
// иначе clearCookie выставит другую cookie, а access_token останется.
function accessTokenCookie(isProduction: boolean) {
  return {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
  };
}
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(48),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

function toPublicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

export function authRoutes(app: FastifyInstance, { db, isProduction }: AuthDeps) {
  // Вход и продление выдают одну и ту же пару cookie.
  async function setAuthCookies(
    reply: FastifyReply,
    userId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
    now: Date,
  ) {
    const accessToken = await reply.jwtSign({ sub: userId });
    reply.setCookie('access_token', accessToken, {
      ...accessTokenCookie(isProduction),
      maxAge: 900,
    });
    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...refreshTokenCookie(isProduction),
      // Cookie живёт ровно столько, сколько токен в базе (maxAge — в секундах).
      maxAge: Math.floor((refreshExpiresAt.getTime() - now.getTime()) / 1000),
    });
  }

  function clearAuthCookies(reply: FastifyReply) {
    reply.clearCookie('access_token', accessTokenCookie(isProduction));
    reply.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookie(isProduction));
  }

  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: z.flattenError(parsed.error) });
    }

    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (user) {
      return reply.status(409).send({ error: 'You are already registered' });
    }
    const passHash = await argon2.hash(parsed.data.password);
    const newUser = await db.user.create({
      data: {
        email: parsed.data.email,
        passwordHash: passHash,
        name: parsed.data.name,
      },
    });

    return reply.status(201).send(toPublicUser(newUser));
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: z.flattenError(parsed.error) });
    }

    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, parsed.data.password);
    if (!isPasswordValid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Сначала сессия в БД, потом cookie: если база упала, клиент не получит
    // refresh-токен, которого нет в базе.
    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const refreshExpiresAt = refreshTokenExpiresAt(now, sessionExpiresAt);
    const refreshToken = generateRefreshToken();
    await db.session.create({
      data: {
        userId: user.id,
        userAgent: request.headers['user-agent']?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        expiresAt: sessionExpiresAt,
        // Вложенная запись: сессия и первый токен создаются одним запросом,
        // Prisma оборачивает его в транзакцию — половинчатой сессии не будет.
        refreshTokens: {
          create: { tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshExpiresAt },
        },
      },
    });

    await setAuthCookies(reply, user.id, refreshToken, refreshExpiresAt, now);
    return reply.status(200).send(toPublicUser(user));
  });

  // Без authenticate: access-токен к этому моменту обычно уже протух — ради этого
  // роут и существует. Пропуском служит refresh-cookie.
  app.post('/auth/refresh', async (request, reply) => {
    // Любой отказ одинаковый: 401 и стёртые cookie. Клиенту незачем знать,
    // протух токен, отозван или подделан, — в любом случае нужен вход по паролю.
    function reject() {
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const presented = request.cookies[REFRESH_TOKEN_COOKIE];
    if (!presented) {
      return reject();
    }

    const stored = await db.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(presented) },
      include: { session: true },
    });
    if (!stored) {
      return reject();
    }

    const { session } = stored;
    const now = new Date();
    if (session.revokedAt || session.expiresAt <= now || stored.expiresAt <= now) {
      return reject();
    }

    // Токен уже меняли, и давно — значит, его скопировали. Кто из двоих вор, хозяин
    // или нет, мы не знаем, поэтому закрываем сессию целиком: вор теряет доступ,
    // хозяин просто войдёт по паролю.
    if (stored.usedAt && now.getTime() - stored.usedAt.getTime() >= REUSE_GRACE_MS) {
      await db.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'REUSE' },
      });
      request.log.warn(
        { sessionId: session.id, userId: session.userId },
        'Повторное использование refresh-токена, сессия отозвана',
      );
      return reject();
    }

    // Сначала новый токен, потом пометка старого: если запись нового упадёт,
    // старый останется неиспользованным и клиент сможет повторить запрос.
    const nextToken = generateRefreshToken();
    const nextExpiresAt = refreshTokenExpiresAt(now, session.expiresAt);
    await db.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: hashRefreshToken(nextToken),
        expiresAt: nextExpiresAt,
      },
    });
    // usedAt: null в условии — не перезаписываем время первого использования.
    // Иначе каждый повтор сдвигал бы окно терпимости, и оно не кончалось бы никогда.
    await db.refreshToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: now },
    });

    await setAuthCookies(reply, session.userId, nextToken, nextExpiresAt, now);
    return reply.status(204).send();
  });

  app.get('/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const id = request.user.sub;
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    return reply.status(200).send(toPublicUser(user));
  });

  // Без authenticate: выход идемпотентен, протухшие cookie тоже должны удаляться.
  // Сессия закрывается в БД, поэтому продлить её больше нельзя. Access-токен
  // stateless и доживёт до exp (≤ 15 мин) — это цена JWT без похода в базу.
  app.post('/auth/logout', async (request, reply) => {
    const presented = request.cookies[REFRESH_TOKEN_COOKIE];
    if (presented) {
      // Один запрос: «закрой сессию, у которой есть токен с таким хэшем».
      // Нет такой или уже закрыта — обновится 0 строк, и это тоже успешный выход.
      await db.session.updateMany({
        where: {
          revokedAt: null,
          refreshTokens: { some: { tokenHash: hashRefreshToken(presented) } },
        },
        data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
      });
    }

    // Cookie чистим после базы: если она упала, клиент получит 500 и останется
    // вошедшим — фронт так и показывает «выйти не удалось».
    clearAuthCookies(reply);
    return reply.status(204).send();
  });
}
