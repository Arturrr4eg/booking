import { describe, expect, it, vi } from 'vitest';
import { postLogout } from './logout';

// Подменяет глобальный fetch: он вернёт этот ответ и не пойдёт в сеть.
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

const unknownError = { ok: false, kind: 'unknown' };

describe('postLogout', () => {
  // Ровно эти опции: с Content-Type: application/json и пустым телом Fastify ответит 400.
  it('отправляет POST /api/auth/logout без тела и заголовков', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await postLogout();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });

  it('204: ok', async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(postLogout()).resolves.toEqual({ ok: true });
  });

  // Успех — только ответ по контракту, остальные 2xx не считаем выходом.
  it('200: unknown', async () => {
    stubFetch(jsonResponse(200, {}));

    await expect(postLogout()).resolves.toEqual(unknownError);
  });

  // API не требует входа для выхода; 401 означал бы, что контракт сломался.
  it('401: unknown', async () => {
    stubFetch(jsonResponse(401, { error: 'Unauthorized' }));

    await expect(postLogout()).resolves.toEqual(unknownError);
  });

  it('500 с JSON-телом: unknown', async () => {
    stubFetch(jsonResponse(500, { error: 'Internal Server Error' }));

    await expect(postLogout()).resolves.toEqual(unknownError);
  });

  it('500 с телом не в JSON (API лежит, ответил прокси Next): unknown', async () => {
    stubFetch(new Response('Internal Server Error', { status: 500 }));

    await expect(postLogout()).resolves.toEqual(unknownError);
  });

  it('fetch бросил исключение (нет сети): unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(postLogout()).resolves.toEqual(unknownError);
  });
});
