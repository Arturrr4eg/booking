import { describe, expect, it, vi } from 'vitest';
import { postRegister } from './register';

const form = { email: 'ivan@mail.ru', name: 'Иван', password: 'secret-password' };

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

describe('postRegister', () => {
  it('отправляет POST /api/auth/register с данными формы в JSON', async () => {
    const fetchMock = stubFetch(jsonResponse(201, user));

    await postRegister(form);

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
  });

  it('201 с пользователем: возвращает пользователя', async () => {
    stubFetch(jsonResponse(201, user));

    await expect(postRegister(form)).resolves.toEqual({ ok: true, user });
  });

  it('201 с телом не той формы: unknown', async () => {
    stubFetch(jsonResponse(201, { id: 1 }));

    await expect(postRegister(form)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('400 с ошибками по полям: validation с этими ошибками', async () => {
    const fieldErrors = { name: ['Too small: expected string to have >=1 characters'] };
    stubFetch(jsonResponse(400, { error: { formErrors: [], fieldErrors } }));

    await expect(postRegister(form)).resolves.toEqual({
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

    await expect(postRegister(form)).resolves.toEqual({ ok: false, kind: 'unknown' });
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

    await expect(postRegister(form)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('409: conflict', async () => {
    stubFetch(jsonResponse(409, { error: 'You are already registered' }));

    await expect(postRegister(form)).resolves.toEqual({ ok: false, kind: 'conflict' });
  });

  it('500 с JSON-телом: unknown', async () => {
    stubFetch(jsonResponse(500, { error: 'Internal Server Error' }));

    await expect(postRegister(form)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('500 с телом не в JSON (API лежит, ответил прокси Next): unknown', async () => {
    stubFetch(new Response('Internal Server Error', { status: 500 }));

    await expect(postRegister(form)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });

  it('fetch бросил исключение (нет сети): unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(postRegister(form)).resolves.toEqual({ ok: false, kind: 'unknown' });
  });
});
