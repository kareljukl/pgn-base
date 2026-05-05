import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <h1 style={{ fontSize: '3rem', margin: '0 0 0.5rem' }}>404</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Stránka nenalezena.</p>
      <Link to="/" style={{ color: '#2563eb' }}>Zpět na hlavní stránku</Link>
    </div>
  );
}
