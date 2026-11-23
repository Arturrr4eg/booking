'use client';

import { createContext, useContext } from 'react';
import type { LogoutResult, PublicUser } from '@/shared/api';

// Ровно одно из четырёх состояний. Невозможные сочетания
// («грузится, но пользователь уже есть») не выразить в типе.
export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'guest' }
  | { status: 'error' };

export type AuthContextValue = {
  state: AuthState;
  // Вызывает форма входа: сервер уже вернул пользователя, спрашивать /me ещё раз не нужно.
  signIn: (user: PublicUser) => void;
  // Перепроверить вход: например, по кнопке «Повторить» после ошибки.
  refresh: () => void;
  // Выйти: удаляет cookie на сервере и только при успехе переводит в guest.
  // Результат нужен кнопке, чтобы показать ошибку, — пользователь при ней остаётся вошедшим.
  signOut: () => Promise<LogoutResult>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
