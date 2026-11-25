import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { getServerMe } from '@/shared/api/server-me';
import { Providers } from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'cyrillic'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  title: {
    default: 'Booking — онлайн-запись',
    template: '%s · Booking',
  },
  description: 'Сервис онлайн-записи для мастеров и студий',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  // Запускаем проверку входа, но НЕ ждём (без await): layout отдаёт промис дальше,
  // и статическая оболочка собирается, не дожидаясь cookie и API. Разворачивает
  // промис только тот, кому нужно состояние входа (useAuthState), — внутри своего <Suspense>.
  const serverMe = getServerMe();

  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers serverMe={serverMe}>{children}</Providers>
      </body>
    </html>
  );
}
