import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  active: boolean;
}
interface Role {
  id: string;
  name: string;
  depth: number;
}

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', roleId: '', isAdmin: false });

  const load = async () => {
    const [u, r] = await Promise.all([api<User[]>('/admin/users'), api<Role[]>('/admin/roles')]);
    setUsers(u);
    setRoles(r);
  };
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      const err = e as ApiError;
      setError([err.message, ...Object.entries(err.errors ?? {}).map(([k, v]) => `${k}: ${v}`)].join(' — '));
      return false;
    }
  };
  const patch = (id: string, body: object) => run(() => api(`/admin/users/${id}`, { method: 'PATCH', body }));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api('/admin/users', { method: 'POST', body: form }))) {
      setForm({ firstName: '', lastName: '', email: '', password: '', roleId: '', isAdmin: false });
    }
  };

  return (
    <div>
      <h1>Utenti</h1>
      {error && <div className="error">{error}</div>}
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Ruolo</th>
              <th>Amministratore</th>
              <th>Attivo</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td>
                  {u.firstName} {u.lastName}
                </td>
                <td>{u.email}</td>
                <td>
                  <select value={u.roleId} onChange={(e) => patch(u.id, { roleId: e.target.value })}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {'— '.repeat(r.depth)}
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="checkbox" checked={u.isAdmin} onChange={(e) => patch(u.id, { isAdmin: e.target.checked })} />
                </td>
                <td>
                  <input type="checkbox" checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form className="card" onSubmit={create}>
        <h2>Nuovo utente</h2>
        <div className="form-grid">
          <label>
            <span>Nome</span>
            <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </label>
          <label>
            <span>Cognome</span>
            <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          </label>
          <label>
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            <span>Password iniziale</span>
            <input
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <label>
            <span>Ruolo</span>
            <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required>
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {'— '.repeat(r.depth)}
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} />{' '}
            Amministratore
          </label>
        </div>
        <button className="primary">Crea utente</button>
      </form>
    </div>
  );
}
