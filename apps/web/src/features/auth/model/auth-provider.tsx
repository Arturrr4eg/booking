'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getMe, postLogout, type GetMeResult, type PublicUser } from '@/shared/api';
import { AuthContext, type AuthState } from './auth-context';

function toAuthState(result: GetMeResult): AuthState {
  if (result.ok) return { status: 'authenticated', user: result.user };
  // 401 — точно не вошёл: getMe уже попробовал продлить сессию refresh-токеном, и не вышло.
  // Всё остальное (сеть, 500, сбой продления) — не знаем, поэтому error, а не guest.
  return result.kind === 'unauthorized' ? { status: 'guest' } : { status: 'error' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Номер последнего запроса /me. Ответ применяем, только если номер не изменился:
  // иначе старый ответ перезапишет более свежее состояние (см. signIn).
  const requestIdRef = useRef(0);

  const loadMe = useCallback(() => {
    const requestId = ++requestIdRef.current;
    void getMe().then((result) => {
      if (requestId === requestIdRef.current) setState(toAuthState(result));
    });
  }, []);

  // Сдвигаем номер: ответ /me, который ещё в полёте, будет проигнорирован.
  // Читаем ref в момент вызова, а не при запуске эффекта — нам нужен именно самый свежий номер.
  const ignorePendingMe = useCallback(() => {
    requestIdRef.current++;
  }, []);

  useEffect(() => {
    loadMe();
    // При размонтировании ответ уже никому не нужен.
    return ignorePendingMe;
  }, [loadMe, ignorePendingMe]);

  function signIn(user: PublicUser) {
    // Если /me ещё в полёте, он мог уйти без cookie и вернуть 401. Его ответ не нужен.
    ignorePendingMe();
    setState({ status: 'authenticated', user });
  }

  function refresh() {
    setState({ status: 'loading' });
    loadMe();
  }

  async function signOut() {
    const result = await postLogout();
    // Не вышли — cookie на месте, значит пользователь всё ещё вошёл: состояние не трогаем.
    if (result.ok) {
      // Ответ /me, ушедший до выхода, мог бы вернуть authenticated.
      ignorePendingMe();
      setState({ status: 'guest' });
    }
    return result;
  }

  return <AuthContext value={{ state, signIn, refresh, signOut }}>{children}</AuthContext>;
}
