// Обёртка над fetch для запросов, которым нужен вход (/auth/me и будущие защищённые).
// Access-токен живёт 15 минут. Когда API ответил 401, обёртка один раз тихо продлевает
// сессию refresh-токеном и повторяет исходный запрос — пользователь ничего не замечает.
//
// Только для браузера: refreshPromise — общая переменная модуля. На сервере Next один
// модуль обслуживает всех пользователей сразу, там такое состояние делить нельзя.
//
// НЕ для /auth/login, /auth/register, /auth/logout: там 401 значит «неверный пароль»,
// а не «протух токен», и продлевать нечего.

type RefreshOutcome =
  // Новая пара cookie получена — исходный запрос можно повторять.
  | 'refreshed'
  // Сервер ответил 401: refresh протух, отозван или его нет. Нужен вход по паролю.
  | 'expired'
  // Сеть или 500: мы не знаем, жива ли сессия.
  | 'failed';

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function postRefresh(): Promise<RefreshOutcome> {
  try {
    // Без тела и без Content-Type: Fastify отвечает 400 на JSON-заголовок с пустым телом.
    const response = await fetch('/api/auth/refresh', { method: 'POST' });
    if (response.status === 204) return 'refreshed';
    if (response.status === 401) return 'expired';
    return 'failed';
  } catch {
    return 'failed';
  }
}

// Single-flight: пока один refresh в полёте, все остальные ждут этот же промис.
// Иначе два параллельных 401 отправят один и тот же refresh-токен дважды, и сервер
// после окна в 10 секунд сочтёт второй кражей и закроет сессию.
function refreshSession(): Promise<RefreshOutcome> {
  refreshPromise ??= postRefresh().finally(() => {
    // Refresh закончился — следующий 401 (через 15 минут) запустит новый.
    refreshPromise = null;
  });
  return refreshPromise;
}

// Контракт как у fetch: возвращает Response, а бросает, когда надёжного ответа нет.
// Вызывающий код (getMe) уже ловит исключения и превращает их в kind: 'unknown'.
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) {
    return response;
  }

  const outcome = await refreshSession();
  if (outcome === 'expired') {
    // Сессия кончилась: отдаём исходный 401 — для вызывающего это «не вошёл».
    return response;
  }
  if (outcome === 'failed') {
    // Отдать 401 было бы враньём: пользователя выкинуло бы из-за упавшей сети.
    throw new Error('Не удалось продлить сессию');
  }

  // Повторяем ровно один раз. Если и теперь 401 (например, пользователя удалили),
  // отдаём как есть — без бесконечного цикла refresh → 401 → refresh.
  return fetch(input, init);
}
