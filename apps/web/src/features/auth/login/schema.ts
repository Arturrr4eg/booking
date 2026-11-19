import { z } from 'zod';

// Правила повторяют серверные из apps/api/src/routes/auth.ts.
// Поменяли там — меняй и здесь, иначе форма пропустит то, что отклонит сервер.
export const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Введите корректный email')),
  password: z.string().min(1, 'Введите пароль').max(128, 'Не длиннее 128 символов'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
