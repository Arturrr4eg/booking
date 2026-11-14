import { API_URL } from '@/shared/config';

export async function getApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health/ready`, {
      // Без таймаута зависший API подвесит и рендер страницы.
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
