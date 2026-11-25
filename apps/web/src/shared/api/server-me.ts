import 'server-only';
import { cookies } from 'next/headers';
import { API_URL } from '../config';
import { publicUserSchema, type PublicUser } from './user';

// Что сервер Next знает о входе при запросе страницы. Исходов два, а не три:
// refresh_token к страницам не приходит (его path — /api/auth), поэтому «не вошёл»
// сервер сказать не может. Нет access, 401, сеть, 500 — всё это «не знаю»,
// и решает браузер через authFetch: у него refresh есть.
export type ServerMeResult = { ok: true; user: PublicUser } | { ok: false; kind: 'unknown' };

const unknown = { ok: false, kind: 'unknown' } as const;

// Только для сервера: читает cookie запроса страницы и сам ходит в API.
// В браузере пользуемся getMe — там cookie прикладывает сам браузер.
export async function getServerMe(): Promise<ServerMeResult> {
  const accessToken = (await cookies()).get('access_token')?.value;
  if (!accessToken) return unknown;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/me`, {
      // Сервер Next — не браузер, сам cookie не приложит. Передаём только access:
      // остальным cookie страницы (и чужим, если появятся) в API делать нечего.
      // Значение не пишем в логи: это пропуск пользователя.
      headers: { Cookie: `access_token=${accessToken}` },
      // Без таймаута зависший API подвесит часть страницы. Лучше быстро сказать
      // «не знаю» — браузер переспросит сам.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    return unknown;
  }

  // 401 тоже «не знаю»: access протух, а refresh, возможно, жив.
  if (response.status !== 200) return unknown;

  const body: unknown = await response.json().catch(() => null);
  const user = publicUserSchema.safeParse(body);
  return user.success ? { ok: true, user: user.data } : unknown;
}
