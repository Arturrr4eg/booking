import { describe, expect, it, vi } from 'vitest';
import { postLogin } from './login';

const credentials = { email: 'ivan@mail.ru', password: 'secret-password' };

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

describe('postLogin', () => {
  it('отправляет POST /api/auth/login с данными формы в JSON', async () => {
    const fetchMock = stubFetch(jsonResponse(200, user));

    await postLogin(credentials);

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  });

  it('200 с пользователем: возвращает пользователя', async () => {
    stubFetch(jsonResponse(200, user));

    await expect(postLogin(credentials)).resolves.toEqual({ ok: true, user });
  });

  it('200 с телом не той формы: unknown', async () => {
    stubFetch(jsonResponse(200, { id: 1 }));

    await expect(postLogin(credentials)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('400 с ошибками по полям: validation с этими ошибками', async () => {
    const fieldErrors = { email: ['Invalid email address'] };
    stubFetch(jsonResponse(400, { error: { formErrors: [], fieldErrors } }));

    await expect(postLogin(credentials)).resolves.toEqual({
      ok: false,
      kind: 'validation',
      fieldErrors,
    });
  });

  // #12: если fieldErrors пуст, форме нечего показать под полями.
  it('400 с пустым fieldErrors: unknown', async () => {
    stubFetch(
      jsonResponse(400, {
        error: { formErrors: ['Invalid input: expected object, received string'], fieldErrors: {} },
      }),
    );

    await expect(postLogin(credentials)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('400 от самого Fastify (FST_ERR_CTP_*): unknown', async () => {
    stubFetch(
      jsonResponse(400, {
        statusCode: 400,
        code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
        error: 'Bad Request',
        message: "Body cannot be empty when content-type is set to 'application/json'",
      }),
    );

    await expect(postLogin(credentials)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('401: invalid-credentials', async () => {
    stubFetch(jsonResponse(401, { error: 'Invalid email or password' }));

    await expect(postLogin(credentials)).resolves.toEqual({
      ok: false,
      kind: 'invalid-credentials',
    });
  });

  it('500 с JSON-телом: unknown', async () => {
    stubFetch(jsonResponse(500, { error: 'Internal Server Error' }));

    await expect(postLogin(credentials)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('500 с телом не в JSON (API лежит, ответил прокси Next): unknown', async () => {
    stubFetch(new Response('Internal Server Error', { status: 500 }));

    await expect(postLogin(credentials)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('fetch бросил исключение (нет сети): unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(postLogin(credentials)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });
});
