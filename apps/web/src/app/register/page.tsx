import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/register/register-form';

export const metadata: Metadata = { title: 'Регистрация' };

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <RegisterForm />
    </main>
  );
}
