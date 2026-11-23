'use client';

import { useState } from 'react';
import { useAuth } from '../model/auth-context';

export function LogoutButton() {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setLoading(true);
    const result = await signOut();
    // При успехе провайдер переведёт состояние в guest и кнопка исчезнет.
    setLoading(false);
    if (!result.ok) {
      setError('Не удалось выйти, попробуйте ещё раз');
    }
  };

  return (
    <>
      <button type="button" onClick={handleClick} disabled={loading} className="text-sm underline">
        {loading ? 'Выходим…' : 'Выйти'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
