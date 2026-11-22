import { z } from 'zod';

// Публичный пользователь: то, что API отдаёт наружу через toPublicUser.
// Схема одна на все клиенты (register, login, me), тип выводится из неё,
// поэтому они не могут разъехаться.
export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
