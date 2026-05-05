import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

type PublicDatabase = {
  id: string;
  name: string;
  description: string | null;
  owner_name: string;
  game_count: number;
  updated_at: number;
};

export function PublicDatabases() {
  const { data, isLoading } = useQuery({
    queryKey: ['public', 'databases'],
    queryFn: () => api.get<{ databases: PublicDatabase[] }>('/public/databases'),
  });

  if (isLoading) return <p>Načítání...</p>;

  const databases = data?.databases ?? [];

  return (
    <div>
      <h1>Veřejné databáze</h1>

      {databases.length === 0 ? (
        <p style={{ color: '#888' }}>Žádné veřejné databáze.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={thStyle}>Název</th>
              <th style={thStyle}>Popis</th>
              <th style={thStyle}>Vlastník</th>
              <th style={thStyle}>Partií</th>
            </tr>
          </thead>
          <tbody>
            {databases.map((db) => (
              <tr key={db.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>
                  <Link to={`/public/${db.id}`} style={{ fontWeight: 500 }}>{db.name}</Link>
                </td>
                <td style={{ ...tdStyle, color: '#666' }}>{db.description || '—'}</td>
                <td style={tdStyle}>{db.owner_name}</td>
                <td style={tdStyle}>{db.game_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.8rem', textTransform: 'uppercase', color: '#666' };
const tdStyle: React.CSSProperties = { padding: '0.6rem 0.75rem' };
