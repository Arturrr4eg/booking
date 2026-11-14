// Адрес API для запросов с сервера Next. Переменная без префикса NEXT_PUBLIC_
// в браузерный бандл не попадает.
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
