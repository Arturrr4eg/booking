'use client';

import type { ReactNode } from 'react';
import type { ServerMeResult } from '@/shared/api';
import { AuthProvider } from '@/features/auth/model/auth-provider';

type ProvidersProps = {
  serverMe: Promise<ServerMeResult>;
  children: ReactNode;
};

// Все клиентские провайдеры приложения в одном месте, чтобы layout остался серверным.
export function Providers({ serverMe, children }: ProvidersProps) {
  return <AuthProvider serverMe={serverMe}>{children}</AuthProvider>;
}
