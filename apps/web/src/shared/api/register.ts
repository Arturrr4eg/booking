import { z } from 'zod';

export type RegisterRequest = { email: string; name: string; password: string };

export type PublicUser = { id: string; email: string; name: string };

export type RegisterResult =
  | { ok: true; user: PublicUser }
  | {
      ok: false;
      kind: 'validation';
      fieldErrors: Partial<Record<keyof RegisterRequest, string[]>>;
    }
  | { ok: false; kind: 'conflict' }
  | { ok: false; kind: 'unknown' };

// Ожидаемые формы тел ответа. Сервер — внешний мир, его ответ проверяем так же,
// как сервер проверяет тело запроса.
const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

const validationErrorSchema = z.object({
  error: z.object({
    fieldErrors: z.object({
      email: z.array(z.string()).optional(),
      name: z.array(z.string()).optional(),
      password: z.array(z.string()).optional(),
    }),
  }),
});

const unknownError = { ok: false, kind: 'unknown' } as const;

export async function postRegister(data: RegisterRequest): Promise<RegisterResult> {
  let response: Response;
  try {
    response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // Сети нет или запрос оборвался: ответа не было вообще.
    return unknownError;
  }

  // Если API лежит, прокси может вернуть не JSON — тогда тело считаем пустым.
  const body: unknown = await response.json().catch(() => null);

  if (response.status === 201) {
    const user = publicUserSchema.safeParse(body);
    return user.success ? { ok: true, user: user.data } : unknownError;
  }

  if (response.status === 400) {
    // 400 бывает двух видов: наша валидация полей или отказ самого Fastify.
    // Ошибки по полям есть только в первом случае.
    const parsed = validationErrorSchema.safeParse(body);
    if (parsed.success) {
      return { ok: false, kind: 'validation', fieldErrors: parsed.data.error.fieldErrors };
    }
  }

  if (response.status === 409) {
    return { ok: false, kind: 'conflict' };
  }

  return unknownError;
}
