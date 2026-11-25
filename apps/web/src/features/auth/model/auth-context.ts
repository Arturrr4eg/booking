'use client';

import { createContext, use, useContext } from 'react';
import type { LogoutResult, PublicUser, ServerMeResult } from '@/shared/api';

// Ровно одно из четырёх состояний. Невозможные сочетания
// («грузится, но пользователь уже есть») не выразить в типе.
export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'guest' }
  | { status: 'error' };

export type AuthContextValue = {
  // Ответ сервера Next на момент загрузки страницы. Промис, а не значение: layout его
  // только запускает и не ждёт, поэтому статическая оболочка не ждёт проверку входа.
  serverMe: Promise<ServerMeResult>;
  // Что произошло уже в браузере: вход, выход, клиентский /me. null — пока ничего.
  clientState: AuthState | null;
  // Вызывает форма входа: сервер уже вернул пользователя, спрашивать /me ещё раз не нужно.
  signIn: (user: PublicUser) => void;
  // Перепроверить вход: например, по кнопке «Повторить» после ошибки.
  refresh: () => void;
  // Выйти: удаляет cookie на сервере и только при успехе переводит в guest.
  // Результат нужен кнопке, чтобы показать ошибку, — пользователь при ней остаётся вошедшим.
  signOut: () => Promise<LogoutResult>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

// Действия (signIn, signOut, refresh). Никогда не подвисает — можно звать где угодно.
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

// Начальное состояние по ответу сервера. «Не знаю» — это loading: провайдер запустит
// клиентский /me, и уже он решит, вошёл пользователь или нет.
export function serverMeToAuthState(serverMe: ServerMeResult): AuthState {
  return serverMe.ok ? { status: 'authenticated', user: serverMe.user } : { status: 'loading' };
}

// Текущее состояние входа. Два источника правды сводим по правилу «кто свежее, тот прав»:
// ответ сервера — снимок на момент загрузки страницы, а всё, что случилось в браузере, — позже.
//
// Пока сервер не ответил, use подвешивает компонент. Звать только внутри <Suspense>,
// иначе подвиснет всё до ближайшей границы.
export function useAuthState(): AuthState {
  const { serverMe, clientState } = useAuth();
  // После входа или выхода сервер уже не нужен. use, в отличие от хуков, можно звать по условию.
  if (clientState) return clientState;
  return serverMeToAuthState(use(serverMe));
}
