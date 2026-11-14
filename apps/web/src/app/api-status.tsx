import { getApiHealth } from '@/shared/api/health';

// Серверный компонент: запрос к API уходит с сервера Next, в браузер приходит готовый HTML.
export async function ApiStatus() {
  const isUp = await getApiHealth();

  return (
    <p className="flex items-center gap-2 text-sm">
      <span
        aria-hidden
        className={`size-2 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-red-500'}`}
      />
      {isUp ? 'API работает' : 'API недоступен'}
    </p>
  );
}
