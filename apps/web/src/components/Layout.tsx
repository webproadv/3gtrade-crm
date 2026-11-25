import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../session';

export function Layout() {
  const { me, modules, logout } = useSession();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">3Gtrade CRM</div>
        <nav>
          <NavLink to="/" end>
            Panoramica
          </NavLink>
          {modules.some((m) => m.name === 'Activities') && <NavLink to="/calendar">Calendario</NavLink>}
          <NavLink to="/reports">Rapporti</NavLink>
          {modules.map((m) => (
            <NavLink key={m.name} to={`/m/${m.name}`}>
              {m.label}
            </NavLink>
          ))}
          {me?.isAdmin && (
            <>
              <div className="nav-section">Impostazioni</div>
              <NavLink to="/admin/modules">Moduli e campi</NavLink>
              <NavLink to="/admin/users">Utenti</NavLink>
              <NavLink to="/admin/roles">Ruoli e profili</NavLink>
            </>
          )}
        </nav>
        <div className="user-box">
          <div>
            <strong>
              {me?.firstName} {me?.lastName}
            </strong>
          </div>
          <div className="muted small">
            {me?.role} · {me?.tenantName}
          </div>
          <NavLink to="/password" className="small">
            Cambia password
          </NavLink>{' '}
          ·{' '}
          <button className="link small" onClick={logout}>
            Esci
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
