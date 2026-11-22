'use client';

import Link from 'next/link';
import { useAuth } from '@/features/auth/model/auth-context';

export function HomeAuth() {
  const { state, refresh } = useAuth();

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
      return <p>Вы вошли как {state.user.name}</p>;

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
