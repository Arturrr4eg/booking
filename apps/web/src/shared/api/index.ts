export { publicUserSchema } from './user';
export type { PublicUser } from './user';
export { postRegister } from './register';
export type { RegisterRequest, RegisterResult } from './register';
export { postLogin } from './login';
export type { LoginRequest, LoginResult } from './login';
export { getMe } from './me';
export type { GetMeResult } from './me';
export { postLogout } from './logout';
export type { LogoutResult } from './logout';
export { authFetch } from './auth-fetch';
// Только тип: он стирается при сборке, поэтому server-only не попадёт в браузер.
// Саму getServerMe импортировать напрямую из './server-me' и только на сервере.
export type { ServerMeResult } from './server-me';
