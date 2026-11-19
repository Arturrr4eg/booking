'use client';

import Link from 'next/link';
import { useLoginForm } from './use-login-form';

const inputClass =
  'rounded-md border border-zinc-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 aria-invalid:border-red-500';

export function LoginForm() {
  const { form, onSubmit } = useLoginForm();
  const {
    register,
    formState: { errors, isSubmitting },
  } = form;

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Вход</h1>

      {errors.root?.server && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errors.root.server.message}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          className={inputClass}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          className={inputClass}
          {...register('password')}
        />
        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isSubmitting ? 'Входим' : 'Войти'}
      </button>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Нет аккаунта?{' '}
        <Link href="/register" className="underline">
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}
