import { Suspense } from 'react';
import { ApiStatus } from './api-status';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Booking</h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Сервис онлайн-записи для мастеров и студий. Пока здесь только каркас.
      </p>

      {/* Заголовок выше попадает в статическую оболочку страницы при сборке.
          Статус API запрашивается на каждый запрос и достраивается потоком (streaming),
          а до этого пользователь видит fallback. */}
      <Suspense fallback={<p className="text-sm text-zinc-500">Проверяем API…</p>}>
        <ApiStatus />
      </Suspense>
      <Link href="/register">Зарегистрироваться</Link>
    </main>
  );
}
