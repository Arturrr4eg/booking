import { createHash, randomBytes } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Абсолютный потолок сессии: через 90 дней после входа — снова пароль. */
export const SESSION_TTL_MS = 90 * DAY_MS;
/** Скользящий срок одного refresh-токена: не заходил 30 дней — снова пароль. */
export const REFRESH_TOKEN_TTL_MS = 30 * DAY_MS;

// Две вкладки могут одновременно отправить один и тот же refresh: обе увидели 401,
// а cookie общая. Вторая придёт с уже использованным токеном — это не кража.
// Поэтому повтор в первые 10 секунд после использования прощаем.
export const REUSE_GRACE_MS = 10 * 1000;

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Новый токен живёт 30 дней, но не дольше своей сессии.
export function refreshTokenExpiresAt(now: Date, sessionExpiresAt: Date): Date {
  const slidingExpiresAt = now.getTime() + REFRESH_TOKEN_TTL_MS;
  return new Date(Math.min(slidingExpiresAt, sessionExpiresAt.getTime()));
}

// 32 случайных байта = 256 бит. Угадать перебором нереально, поэтому это не JWT:
// проверять подпись не нужно, токен просто ищется в базе по хэшу.
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256, а не argon2: у пароля мало энтропии, его перебирают по словарю, поэтому
// нужен медленный хэш с солью. У случайных 256 бит перебирать нечего, а без соли
// хэш детерминирован — по нему можно искать строку через @unique-индекс.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Path — путь, который видит БРАУЗЕР. Он ходит на /api/auth/*, а Next через rewrites
// пересылает в API на /auth/*. Поставь '/auth' — браузер не отправит cookie вообще.
// Узкий path: refresh уходит только на /api/auth/*, а не с каждым запросом к API.
export function refreshTokenCookie(isProduction: boolean) {
  return {
    path: '/api/auth',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
  };
}
