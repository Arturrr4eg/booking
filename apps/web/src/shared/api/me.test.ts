import { describe, expect, it, vi } from 'vitest';
import { getMe } from './me';

const user = { id: 'user-1', email: 'ivan@mail.ru', name: 'Иван' };

// Подменяет глобальный fetch: он вернёт этот ответ и не пойдёт в сеть.
// Response настоящий, поэтому response.json() ведёт себя как в браузере.
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

describe('getMe', () => {
  it('отправляет GET /api/auth/me без лишних опций', async () => {
    const fetchMock = stubFetch(jsonResponse(200, user));

    await getMe();

    // Второй аргумент — init, который authFetch передаёт дальше; у getMe опций нет.
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', undefined);
  });

  it('200 с пользователем: возвращает пользователя', async () => {
    stubFetch(jsonResponse(200, user));

    await expect(getMe()).resolves.toEqual({ ok: true, user });
  });

  it('200 с телом не той формы: unknown', async () => {
    stubFetch(jsonResponse(200, { id: 1 }));

    await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('200 с телом не в JSON: unknown', async () => {
    stubFetch(new Response('<html>ok</html>', { status: 200 }));

    await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  describe('протухший access-токен (подробно — в auth-fetch.test.ts)', () => {
    // Ответы по очереди: /me, потом /refresh, потом повтор /me.
    function stubSequence(...responses: Response[]) {
      const fetchMock = vi.fn();
      for (const response of responses) fetchMock.mockResolvedValueOnce(response);
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('401 → refresh удался → пользователь', async () => {
      const fetchMock = stubSequence(
        jsonResponse(401, { error: 'Unauthorized' }),
        new Response(null, { status: 204 }),
        jsonResponse(200, user),
      );

      await expect(getMe()).resolves.toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', { method: 'POST' });
    });

    it('401 → refresh 401 (сессия кончилась): unauthorized', async () => {
      stubSequence(
        jsonResponse(401, { error: 'Unauthorized' }),
        jsonResponse(401, { error: 'Unauthorized' }),
      );

      await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unauthorized' });
    });

    it('401 → refresh 500: unknown, а не «не вошёл»', async () => {
      stubSequence(
        jsonResponse(401, { error: 'Unauthorized' }),
        jsonResponse(500, { error: 'Internal Server Error' }),
      );

      await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unknown' });
    });
  });

  it('500 с JSON-телом: unknown', async () => {
    stubFetch(jsonResponse(500, { error: 'Internal Server Error' }));

    await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  // Тело похоже на пользователя, но статус не 200: верить телу нельзя.
  it('500 с телом в форме пользователя: unknown', async () => {
    stubFetch(jsonResponse(500, user));

    await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('500 с телом не в JSON (API лежит, ответил прокси Next): unknown', async () => {
    stubFetch(new Response('Internal Server Error', { status: 500 }));

    await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('fetch бросил исключение (нет сети): unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(getMe()).resolves.toEqual({ ok: false, kind: 'unknown' });
  });
});
