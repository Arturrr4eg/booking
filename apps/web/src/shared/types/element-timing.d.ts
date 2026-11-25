import 'react';

declare module 'react' {
  // T не используем, но параметр обязан совпадать с исходным объявлением в @types/react.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<T> {
    /** Element Timing API: браузер запомнит, когда отрисовал элемент. */
    elementtiming?: string;
  }
}
