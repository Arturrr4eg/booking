import { z } from 'zod';

// Правила повторяют серверные из apps/api/src/routes/auth.ts.
// Поменяли там — меняй и здесь, иначе форма пропустит то, что отклонит сервер.
export const registerFormSchema = z.object({
  name: z.string().trim().min(1, 'Введите имя').max(48, 'Не длиннее 48 символов'),
  email: z.string().trim().toLowerCase().pipe(z.email('Введите корректный email')),
  password: z.string().min(8, 'Минимум 8 символов').max(128, 'Не длиннее 128 символов'),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
