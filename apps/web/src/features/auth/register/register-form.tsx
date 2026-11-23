'use client';

import { useId } from 'react';
import Link from 'next/link';
import { useRegisterForm } from './use-register-form';

const inputClass =
  'rounded-md border border-zinc-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 aria-invalid:border-red-500';

export function RegisterForm() {
  const { form, onSubmit } = useRegisterForm();
  // Next прячет прошлые страницы в <Activity>, но они остаются в DOM. С постоянными id
  // у входа и регистрации были бы одинаковые id="email", и label указал бы на скрытое поле.
  const id = useId();
  const {
    register,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = form;
  // После успешной регистрации запрос уже завершён, но переход на /login ещё идёт.
  // Держим кнопку заблокированной до конца, чтобы не отправить регистрацию второй раз.
  const isBusy = isSubmitting || isSubmitSuccessful;

  return (
    <form
      method="POST"
      onSubmit={onSubmit}
      noValidate
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="text-2xl font-semibold">Регистрация</h1>

      {errors.root?.server && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errors.root.server.message}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`}>Имя</label>
        <input
          id={`${id}-name`}
          autoComplete="name"
          aria-invalid={errors.name ? true : undefined}
          className={inputClass}
          {...register('name')}
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-email`}>Email</label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          className={inputClass}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-password`}>Пароль</label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          className={inputClass}
          {...register('password')}
        />
        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isBusy}
        className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isBusy ? 'Регистрируем…' : 'Зарегистрироваться'}
      </button>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="underline">
          Войти
        </Link>
      </p>
    </form>
  );
}
