import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postRegister } from '@/shared/api';
import { registerFormSchema, type RegisterFormValues } from './schema';

const fields = ['email', 'name', 'password'] as const;

export function useRegisterForm() {
  const router = useRouter();
  const form = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await postRegister(values);

    if (result.ok) {
      router.push('/login');
      return;
    }

    if (result.kind === 'validation') {
      for (const field of fields) {
        const message = result.fieldErrors[field]?.[0];
        if (message) form.setError(field, { message });
      }
      return;
    }

    form.setError('root.server', {
      message:
        result.kind === 'conflict'
          ? 'Этот email уже зарегистрирован'
          : 'Не удалось зарегистрироваться, попробуйте ещё раз',
    });
  });

  return { form, onSubmit };
}
