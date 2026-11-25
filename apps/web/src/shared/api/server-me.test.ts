import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { getServerMe } from './server-me';

// server-only в обычном Node бросает ошибку («этот модуль только для сервера React»).
// Тест — не браузер, так что охрана здесь не нужна: подменяем пустым модулем.
vi.mock('server-only', () => ({}));

// cookies() работает только внутри запроса Next. В тесте запроса нет —
// подменяем и в каждом тесте решаем, какие cookie «пришли» со страницей.
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const user = { id: 'user-1', email: 'ivan@mail.ru', name: 'Иван' };
const unknown = { ok: false, kind: 'unknown' };

// Страница пришла с этими cookie. get(name) — как у настоящего хранилища Next.
function stubCookies(values: Record<string, string>) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name in values ? { name, value: values[name] } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getServerMe', () => {
  beforeEach(() => {
    stubCookies({ access_token: 'access-jwt' });
  });

  it('нет access_token: unknown и в API не ходит', async () => {
    // refresh_token к странице не приходит (path /api/auth), но даже если придёт — не наш.
    stubCookies({ refresh_token: 'refresh-secret' });
    const fetchMock = stubFetch(jsonResponse(200, user));

    await expect(getServerMe()).resolves.toEqual(unknown);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ходит в API_URL/auth/me и передаёт только access_token', async () => {
    stubCookies({ access_token: 'access-jwt', refresh_token: 'refresh-secret', theme: 'dark' });
    const fetchMock = stubFetch(jsonResponse(200, user));

    await getServerMe();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/auth/me', {
      headers: { Cookie: 'access_token=access-jwt' },
      signal: expect.any(AbortSignal),
    });
  });

  it('200 с пользователем: возвращает пользователя', async () => {
    stubFetch(jsonResponse(200, user));

    await expect(getServerMe()).resolves.toEqual({ ok: true, user });
  });

  // Не «гость»: refresh в браузере, возможно, жив — решает клиент.
  it('401 (access протух): unknown', async () => {
    stubFetch(jsonResponse(401, { error: 'Unauthorized' }));

    await expect(getServerMe()).resolves.toEqual(unknown);
  });

  // Статус важнее тела: иначе мутация «проверять схему и при 401» выжила бы.
  it('401 с телом в форме пользователя: unknown', async () => {
    stubFetch(jsonResponse(401, user));

    await expect(getServerMe()).resolves.toEqual(unknown);
  });

  it('500: unknown', async () => {
    stubFetch(jsonResponse(500, { error: 'Internal Server Error' }));

    await expect(getServerMe()).resolves.toEqual(unknown);
  });

  it('500 с телом в форме пользователя: unknown', async () => {
    stubFetch(jsonResponse(500, user));

    await expect(getServerMe()).resolves.toEqual(unknown);
  });

  it('200 с телом не той формы: unknown', async () => {
    stubFetch(jsonResponse(200, { id: 1 }));

    await expect(getServerMe()).resolves.toEqual(unknown);
  });

  it('200 с телом не в JSON: unknown', async () => {
    stubFetch(new Response('<html>ok</html>', { status: 200 }));

    await expect(getServerMe()).resolves.toEqual(unknown);
  });

  it('fetch бросил (сеть, таймаут): unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(getServerMe()).resolves.toEqual(unknown);
  });
});
