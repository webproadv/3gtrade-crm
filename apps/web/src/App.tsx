import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminModules } from './pages/admin/AdminModules';
import { AdminRoles } from './pages/admin/AdminRoles';
import { AdminUsers } from './pages/admin/AdminUsers';
import { Calendar } from './pages/Calendar';
import { Home } from './pages/Home';
import { ListView } from './pages/ListView';
import { Login } from './pages/Login';
import { RecordForm } from './pages/RecordForm';
import { RecordView } from './pages/RecordView';
import { useSession } from './session';

export function App() {
  const { me, loading } = useSession();
  if (loading) return <div className="center muted">Caricamento…</div>;
  if (!me) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="m/:module" element={<ListView />} />
        <Route path="m/:module/new" element={<RecordForm />} />
        <Route path="m/:module/:id" element={<RecordView />} />
        <Route path="m/:module/:id/edit" element={<RecordForm />} />
        {me.isAdmin && (
          <>
            <Route path="admin/modules" element={<AdminModules />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/roles" element={<AdminRoles />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
