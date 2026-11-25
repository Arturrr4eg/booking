import { Suspense } from 'react';
import { ApiStatus } from './api-status';
import { HomeAuth } from './home-auth';

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

      {/* Состояние входа знает только запрос (cookie), поэтому оно не в оболочке, а за границей:
          в оболочку при сборке попадает fallback, а вошедший получает имя тем же HTML-потоком.
          Fallback пустой: оболочку браузер рисует раньше, чем дойдёт имя, и текст-заглушка
          успел бы мелькнуть. «Проверяем вход…» остаётся только для «не знаю» (рисует HomeAuth).
          min-h-13 — высота блока «вошёл» (строка + кнопка), чтобы ничего не прыгало. */}
      <div className="flex min-h-13 flex-col items-center">
        <Suspense fallback={null}>
          <HomeAuth />
        </Suspense>
      </div>
    </main>
  );
}
