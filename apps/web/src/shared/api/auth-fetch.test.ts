import { afterEach, describe, expect, it, vi } from 'vitest';
import { authFetch } from './auth-fetch';

const ME = '/api/auth/me';
const REFRESH = '/api/auth/refresh';

type Reply = Response | Error | Promise<Response>;

// Фейковый fetch: на каждый адрес — очередь ответов по порядку.
// Error в очереди — fetch бросит (нет сети). Promise — ответ придёт, когда тест решит.
function stubFetch(replies: Record<string, Reply[]>) {
  const fetchMock = vi.fn(async (url: string) => {
    const reply = replies[url]?.shift();
    if (reply === undefined) throw new Error(`Неожиданный запрос ${url}`);
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function status(code: number) {
  return new Response(code === 204 ? null : '{}', { status: code });
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>, url: string) {
  return fetchMock.mock.calls.filter(([calledUrl]) => calledUrl === url).length;
}

// Промис, который тест разрешает вручную: так refresh «висит в полёте» сколько нужно.
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authFetch', () => {
  it('не 401 — отдаёт ответ как есть и не продлевает', async () => {
    const fetchMock = stubFetch({ [ME]: [status(200)] });

    const response = await authFetch(ME);

    expect(response.status).toBe(200);
    expect(callsTo(fetchMock, REFRESH)).toBe(0);
  });

  it('500 — тоже без продления: refresh нужен только на 401', async () => {
    const fetchMock = stubFetch({ [ME]: [status(500)] });

    const response = await authFetch(ME);

    expect(response.status).toBe(500);
    expect(callsTo(fetchMock, REFRESH)).toBe(0);
  });

  it('401 → refresh 204 → повторяет запрос с теми же аргументами', async () => {
    const init = { headers: { 'X-Test': '1' } };
    const fetchMock = stubFetch({ [ME]: [status(401), status(200)], [REFRESH]: [status(204)] });

    const response = await authFetch(ME, init);

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls).toEqual([
      [ME, init],
      [REFRESH, { method: 'POST' }],
      [ME, init],
    ]);
  });

  it('refresh уходит POST без тела и без Content-Type', async () => {
    const fetchMock = stubFetch({ [ME]: [status(401), status(200)], [REFRESH]: [status(204)] });

    await authFetch(ME);

    expect(fetchMock).toHaveBeenCalledWith(REFRESH, { method: 'POST' });
  });

  it('401 → refresh 401 (сессия кончилась) — отдаёт исходный 401 без повтора', async () => {
    const original = status(401);
    const fetchMock = stubFetch({ [ME]: [original], [REFRESH]: [status(401)] });

    const response = await authFetch(ME);

    expect(response).toBe(original);
    expect(callsTo(fetchMock, ME)).toBe(1);
  });

  it.each([
    ['refresh 500', status(500)],
    // Наш API отвечает только 204. 200 — чужой ответ (например, HTML-страница от прокси).
    ['refresh 200 вместо 204', status(200)],
    ['refresh 400', status(400)],
    ['нет сети при refresh', new TypeError('Failed to fetch')],
  ])('401 → %s — бросает, а не притворяется «не вошёл»', async (_name, refreshReply) => {
    const fetchMock = stubFetch({ [ME]: [status(401)], [REFRESH]: [refreshReply] });

    await expect(authFetch(ME)).rejects.toThrow();
    expect(callsTo(fetchMock, ME)).toBe(1);
  });

  it('повтор снова 401 — отдаёт его, второй раз не продлевает', async () => {
    const fetchMock = stubFetch({ [ME]: [status(401), status(401)], [REFRESH]: [status(204)] });

    const response = await authFetch(ME);

    expect(response.status).toBe(401);
    expect(callsTo(fetchMock, REFRESH)).toBe(1);
    expect(callsTo(fetchMock, ME)).toBe(2);
  });

  it('исходный fetch бросил — пробрасывает ошибку', async () => {
    stubFetch({ [ME]: [new TypeError('Failed to fetch')] });

    await expect(authFetch(ME)).rejects.toThrow('Failed to fetch');
  });

  it('single-flight: два параллельных 401 ждут один refresh', async () => {
    const refresh = deferred();
    const fetchMock = stubFetch({
      [ME]: [status(401), status(401), status(200), status(200)],
      [REFRESH]: [refresh.promise],
    });

    const first = authFetch(ME);
    const second = authFetch(ME);
    // Даём обоим запросам получить 401 и встать в ожидание refresh.
    await vi.waitFor(() => expect(callsTo(fetchMock, ME)).toBe(2));
    refresh.resolve(status(204));

    const responses = await Promise.all([first, second]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(callsTo(fetchMock, REFRESH)).toBe(1);
  });

  it('single-flight: если общий refresh не помог, оба получают 401', async () => {
    const refresh = deferred();
    const fetchMock = stubFetch({
      [ME]: [status(401), status(401)],
      [REFRESH]: [refresh.promise],
    });

    const both = Promise.all([authFetch(ME), authFetch(ME)]);
    await vi.waitFor(() => expect(callsTo(fetchMock, ME)).toBe(2));
    refresh.resolve(status(401));

    expect((await both).map((r) => r.status)).toEqual([401, 401]);
    expect(callsTo(fetchMock, REFRESH)).toBe(1);
  });

  it('после завершения refresh следующий 401 запускает новый', async () => {
    const fetchMock = stubFetch({
      [ME]: [status(401), status(200), status(401), status(200)],
      [REFRESH]: [status(204), status(204)],
    });

    await authFetch(ME);
    await authFetch(ME);

    expect(callsTo(fetchMock, REFRESH)).toBe(2);
  });

  it('после неудачного refresh следующий 401 тоже пробует заново', async () => {
    const fetchMock = stubFetch({
      [ME]: [status(401), status(401), status(200)],
      [REFRESH]: [status(500), status(204)],
    });

    await expect(authFetch(ME)).rejects.toThrow();
    const response = await authFetch(ME);

    expect(response.status).toBe(200);
    expect(callsTo(fetchMock, REFRESH)).toBe(2);
  });
});
