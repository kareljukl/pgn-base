import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SanFormatToggle } from './SanFormatToggle';

export function Layout() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid #e0e0e0' }}>
        <Link to="/" style={{ fontWeight: 700, fontSize: '1.25rem', textDecoration: 'none', color: '#1a1a1a' }}>
          PGN Base
        </Link>
        <nav style={{ display: 'flex', gap: '1rem', flex: 1 }}>
          {isAuthenticated && <Link to="/">Moje databáze</Link>}
          <Link to="/public">Veřejné databáze</Link>
        </nav>
        <SanFormatToggle />
        {isAuthenticated && user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.name}
                style={{ width: 28, height: 28, borderRadius: '50%' }}
              />
            )}
            <span style={{ fontSize: '0.875rem' }}>{user.name}</span>
            <button
              onClick={logout}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: '#fff',
              }}
            >
              Odhlásit
            </button>
          </div>
        )}
        {!isAuthenticated && (
          <Link to="/login" style={{ fontSize: '0.875rem' }}>Přihlásit se</Link>
        )}
      </header>
      <main style={{ padding: '1.5rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
