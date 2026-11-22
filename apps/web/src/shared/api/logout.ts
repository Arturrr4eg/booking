export type LogoutResult = { ok: true } | { ok: false; kind: 'unknown' };

const unknownError = { ok: false, kind: 'unknown' } as const;

export async function postLogout(): Promise<LogoutResult> {
  let response: Response;
  try {
    response = await fetch('/api/auth/logout', {
      method: 'POST',
    });
  } catch {
    return unknownError;
  }
  if (response.status === 204) {
    return { ok: true };
  }
  return unknownError;
}
