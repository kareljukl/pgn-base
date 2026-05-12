import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Databases } from './pages/Databases';
import { DatabaseDetail } from './pages/DatabaseDetail';
import { GameViewer } from './pages/GameViewer';
import { GameEditor } from './pages/GameEditor';
import { PublicDatabases } from './pages/PublicDatabases';
import { PublicDatabase } from './pages/PublicDatabase';
import { PublicGameViewer } from './pages/PublicGameViewer';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        {/* Protected routes — require auth */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Databases />} />
          <Route path="/db/:id" element={<DatabaseDetail />} />
          <Route path="/db/:id/game/new" element={<GameEditor />} />
          <Route path="/db/:id/game/:gameId" element={<GameViewer />} />
        </Route>
        {/* Public routes — no auth required */}
        <Route path="/public" element={<PublicDatabases />} />
        <Route path="/public/:id" element={<PublicDatabase />} />
        <Route path="/public/:id/game/:gameId" element={<PublicGameViewer />} />
        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
