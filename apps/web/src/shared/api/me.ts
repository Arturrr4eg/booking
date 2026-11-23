import { authFetch } from './auth-fetch';
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
    // Через обёртку: протухший access-токен она молча продлит и повторит запрос.
    response = await authFetch('/api/auth/me');
  } catch {
    // Сети нет, запрос оборвался или не удалось продлить сессию: надёжного ответа нет.
    return unknownError;
  }

  // 401 — нормальный ответ «не вошёл»: refresh тоже не помог (сессия кончилась или отозвана)
  // либо пользователя удалили.
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
