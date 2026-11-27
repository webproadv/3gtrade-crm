import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminModules } from './pages/admin/AdminModules';
import { AdminRoles } from './pages/admin/AdminRoles';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminWorkflows } from './pages/admin/AdminWorkflows';
import { WorkflowEditor } from './pages/admin/WorkflowEditor';
import { Calendar } from './pages/Calendar';
import { ChangePassword } from './pages/ChangePassword';
import { Home } from './pages/Home';
import { ListView } from './pages/ListView';
import { Login } from './pages/Login';
import { PrintView } from './pages/PrintView';
import { RecordForm } from './pages/RecordForm';
import { RecordView } from './pages/RecordView';
import { ReportEditor } from './pages/reports/ReportEditor';
import { ReportsList } from './pages/reports/ReportsList';
import { ReportView } from './pages/reports/ReportView';
import { useSession } from './session';

export function App() {
  const { me, loading } = useSession();
  if (loading) return <div className="center muted">Caricamento…</div>;
  if (!me) return <Login />;
  return (
    <Routes>
      <Route path="m/:module/:id/print" element={<PrintView />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="password" element={<ChangePassword />} />
        <Route path="reports" element={<ReportsList />} />
        <Route path="reports/new" element={<ReportEditor />} />
        <Route path="reports/:id" element={<ReportView />} />
        <Route path="reports/:id/edit" element={<ReportEditor />} />
        <Route path="m/:module" element={<ListView />} />
        <Route path="m/:module/new" element={<RecordForm />} />
        <Route path="m/:module/:id" element={<RecordView />} />
        <Route path="m/:module/:id/edit" element={<RecordForm />} />
        {me.isAdmin && (
          <>
            <Route path="admin/modules" element={<AdminModules />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/roles" element={<AdminRoles />} />
            <Route path="admin/workflows" element={<AdminWorkflows />} />
            <Route path="admin/workflows/new" element={<WorkflowEditor />} />
            <Route path="admin/workflows/:id" element={<WorkflowEditor />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
