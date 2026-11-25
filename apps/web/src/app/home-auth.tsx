'use client';

import Link from 'next/link';
import { useAuth, useAuthState } from '@/features/auth/model/auth-context';
import { LogoutButton } from '@/features/auth/logout/logout-button';

// Подвисает, пока сервер проверяет вход (useAuthState), — держать внутри <Suspense>.
export function HomeAuth() {
  const state = useAuthState();
  const { refresh } = useAuth();

  switch (state.status) {
    case 'loading':
      return <p className="text-sm text-zinc-500">Проверяем вход…</p>;

    case 'error':
      return (
        <div className="flex flex-col items-center gap-2">
          <p role="alert" className="text-sm text-red-700">
            Не удалось проверить вход
          </p>
          <button type="button" onClick={refresh} className="text-sm underline">
            Повторить
          </button>
        </div>
      );

    case 'authenticated':
      return (
        <div className="flex flex-col items-center gap-2">
          <p elementtiming="user-name">Вы вошли как {state.user.name}</p>
          <LogoutButton />
        </div>
      );

    case 'guest':
      return (
        <div className="flex gap-4">
          <Link href="/register" className="underline">
            Зарегистрироваться
          </Link>
          <Link href="/login" className="underline">
            Войти
          </Link>
        </div>
      );
  }
}
