'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/model/auth-provider';

// Все клиентские провайдеры приложения в одном месте, чтобы layout остался серверным.
export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
