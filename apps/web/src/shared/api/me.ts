import { publicUserSchema, type PublicUser } from './user';

export type GetMeResult =
  | { ok: true; user: PublicUser }
  | { ok: false; kind: 'unauthorized' }
  | { ok: false; kind: 'unknown' };

const unknownError = { ok: false, kind: 'unknown' } as const;

// Кто сейчас вошёл. Cookie access_token браузер приложит сам:
// запрос идёт на тот же адрес, что и страница (через rewrites в next.config.ts).
export async function getMe(): Promise<GetMeResult> {
  let response: Response;
  try {
    response = await fetch('/api/auth/me');
  } catch {
    // Сети нет или запрос оборвался: ответа не было вообще.
    return unknownError;
  }

  // 401 — нормальный ответ «не вошёл»: нет cookie, токен протух или пользователя удалили.
  if (response.status === 401) {
    return { ok: false, kind: 'unauthorized' };
  }

  if (response.status !== 200) {
    return unknownError;
  }

  // Если API лежит, прокси может вернуть не JSON — тогда тело считаем пустым.
  const body: unknown = await response.json().catch(() => null);
  const user = publicUserSchema.safeParse(body);
  return user.success ? { ok: true, user: user.data } : unknownError;
}
