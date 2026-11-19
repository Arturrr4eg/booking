import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/login/login-form';

export const metadata: Metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <LoginForm />
    </main>
  );
}
