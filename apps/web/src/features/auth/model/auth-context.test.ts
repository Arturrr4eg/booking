import { describe, expect, it } from 'vitest';
import { serverMeToAuthState } from './auth-context';

const user = { id: 'user-1', email: 'ivan@mail.ru', name: 'Иван' };

describe('serverMeToAuthState', () => {
  it('сервер узнал пользователя: сразу authenticated', () => {
    expect(serverMeToAuthState({ ok: true, user })).toEqual({ status: 'authenticated', user });
  });

  // Не guest: сервер без refresh_token не может знать, что пользователь не вошёл.
  it('сервер не знает: loading, решит клиентский /me', () => {
    expect(serverMeToAuthState({ ok: false, kind: 'unknown' })).toEqual({ status: 'loading' });
  });
});
