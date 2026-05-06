import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { setToken } from '../lib/auth';

export function Login() {
  const { isAuthenticated, isLoading, login, devLogin } = useAuth();
  const navigate = useNavigate();

  // Handle token from OAuth redirect (hash fragment)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = hash.slice(7);
      setToken(token);
      window.location.hash = '';
      // Force re-check auth
      window.location.href = '/';
    }
    if (hash.startsWith('#error=')) {
      console.error('OAuth error:', hash.slice(7));
    }
  }, [navigate]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Načítání...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h1 style={{ marginBottom: '0.5rem' }}>PGN Base</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          Přihlaste se pro přístup ke svým databázím.
        </p>
        <button
          onClick={login}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            border: '1px solid #ddd',
            borderRadius: '4px',
            background: '#fff',
          }}
        >
          Přihlásit se přes Google
        </button>
        {import.meta.env.DEV && (
          <button
            onClick={devLogin}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '0.75rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              cursor: 'pointer',
              border: '1px solid #c5a',
              borderRadius: '4px',
              background: '#fef',
              color: '#a35',
            }}
          >
            Dev Login (testovací uživatel)
          </button>
        )}
      </div>
    </div>
  );
}
