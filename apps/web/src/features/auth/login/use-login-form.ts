import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postLogin } from '@/shared/api';
import { loginFormSchema, type LoginFormValues } from './schema';

const fields = ['email', 'password'] as const;

export function useLoginForm() {
  const router = useRouter();
  const form = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await postLogin(values);

    if (result.ok) {
      router.push('/');
      return;
    }

    if (result.kind === 'validation') {
      let hasFieldError = false;
      for (const field of fields) {
        const message = result.fieldErrors[field]?.[0];
        if (message) {
          form.setError(field, { message });
          hasFieldError = true;
        }
      }
      if (hasFieldError) return;
    }

    form.setError('root.server', {
      message:
        result.kind === 'invalid-credentials'
          ? 'Неправильный логин или пароль'
          : 'Не удалось войти, попробуйте ещё раз',
    });
  });

  return { form, onSubmit };
}
