import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import type { Module, Perm } from '../../types';

interface Role {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  profileIds: string[];
  userCount: number;
}
interface Profile {
  id: string;
  name: string;
  description: string | null;
  modules: Record<string, Perm>;
  fields: Record<string, { visible: boolean; editable: boolean }>;
}

const ACTIONS: [keyof Perm, string][] = [
  ['view', 'Vedere'],
  ['create', 'Creare'],
  ['edit', 'Modificare'],
  ['delete', 'Eliminare'],
];
const NONE: Perm = { view: false, create: false, edit: false, delete: false };

export function AdminRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [profileId, setProfileId] = useState('');
  const [draft, setDraft] = useState<Profile | null>(null);
  const [fieldsOf, setFieldsOf] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async () => {
    const [r, p, m] = await Promise.all([
      api<Role[]>('/admin/roles'),
      api<Profile[]>('/admin/profiles'),
      api<Module[]>('/admin/modules'),
    ]);
    setRoles(r);
    setProfiles(p);
    setModules(m);
    setProfileId((id) => id || p[0]?.id || '');
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const p = profiles.find((x) => x.id === profileId);
    setDraft(p ? structuredClone(p) : null);
    setSaved(false);
  }, [profileId, profiles]);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError((e as ApiError).message);
      return false;
    }
  };

  const setPerm = (module: string, action: keyof Perm, value: boolean) => {
    if (!draft) return;
    const cur = { ...(draft.modules[module] ?? NONE), [action]: value };
    if (action === 'view' && !value) cur.create = cur.edit = cur.delete = false;
    if (action !== 'view' && value) cur.view = true;
    setDraft({ ...draft, modules: { ...draft.modules, [module]: cur } });
    setSaved(false);
  };
  const setFieldPerm = (fieldId: string, key: 'visible' | 'editable', value: boolean) => {
    if (!draft) return;
    const cur = { ...(draft.fields[fieldId] ?? { visible: true, editable: true }), [key]: value };
    if (key === 'visible' && !value) cur.editable = false;
    if (key === 'editable' && value) cur.visible = true;
    setDraft({ ...draft, fields: { ...draft.fields, [fieldId]: cur } });
    setSaved(false);
  };
  const saveProfile = async () => {
    if (!draft) return;
    const allFieldIds = modules.flatMap((m) => m.fields.map((f) => f.id));
    const fields = Object.fromEntries(
      allFieldIds.map((id) => [id, draft.fields[id] ?? { visible: true, editable: true }]),
    );
    const modulesBody = Object.fromEntries(modules.map((m) => [m.name, draft.modules[m.name] ?? NONE]));
    if (await run(() => api(`/admin/profiles/${draft.id}/permissions`, { method: 'PUT', body: { modules: modulesBody, fields } }))) {
      setSaved(true);
    }
  };

  const toggleRoleProfile = (role: Role, pid: string, on: boolean) =>
    run(() =>
      api(`/admin/roles/${role.id}`, {
        method: 'PATCH',
        body: { profileIds: on ? [...role.profileIds, pid] : role.profileIds.filter((x) => x !== pid) },
      }),
    );

  const fieldModule = modules.find((m) => m.name === fieldsOf);

  return (
    <div>
      <h1>Ruoli e profili</h1>
      <p className="muted">
        I <strong>ruoli</strong> formano la gerarchia: chi sta più in alto vede i record di chi sta sotto. I{' '}
        <strong>profili</strong> definiscono cosa si può fare su moduli e campi; un ruolo può avere più profili.
      </p>
      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>Gerarchia dei ruoli</h2>
        <table className="table compact">
          <thead>
            <tr>
              <th>Ruolo</th>
              <th>Utenti</th>
              {profiles.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td style={{ paddingLeft: 8 + r.depth * 20 }}>{r.name}</td>
                <td>{r.userCount}</td>
                {profiles.map((p) => (
                  <td key={p.id}>
                    <input
                      type="checkbox"
                      checked={r.profileIds.includes(p.id)}
                      onChange={(e) => toggleRoleProfile(r, p.id, e.target.checked)}
                    />
                  </td>
                ))}
                <td className="nowrap">
                  <button
                    className="link"
                    onClick={() => {
                      const name = window.prompt(`Nome del nuovo ruolo sotto "${r.name}"`);
                      if (name) void run(() => api('/admin/roles', { method: 'POST', body: { name, parentId: r.id, profileIds: r.profileIds } }));
                    }}
                  >
                    + sottoruolo
                  </button>{' '}
                  {r.parentId && (
                    <button
                      className="link danger"
                      onClick={() => window.confirm(`Eliminare il ruolo "${r.name}"?`) && run(() => api(`/admin/roles/${r.id}`, { method: 'DELETE' }))}
                    >
                      elimina
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Permessi del profilo</h2>
          <div className="actions">
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const name = window.prompt('Nome del nuovo profilo');
                if (name) void run(() => api('/admin/profiles', { method: 'POST', body: { name, copyFrom: profileId || undefined } }));
              }}
            >
              Duplica come nuovo
            </button>
          </div>
        </div>
        {draft && (
          <>
            <table className="table compact">
              <thead>
                <tr>
                  <th>Modulo</th>
                  {ACTIONS.map(([, l]) => (
                    <th key={l}>{l}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.name}>
                    <td>{m.label}</td>
                    {ACTIONS.map(([a]) => (
                      <td key={a}>
                        <input
                          type="checkbox"
                          checked={(draft.modules[m.name] ?? NONE)[a]}
                          onChange={(e) => setPerm(m.name, a, e.target.checked)}
                        />
                      </td>
                    ))}
                    <td>
                      <button className="link" onClick={() => setFieldsOf(fieldsOf === m.name ? '' : m.name)}>
                        {fieldsOf === m.name ? 'chiudi campi' : 'permessi sui campi'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fieldModule && (
              <div className="subcard">
                <h3>Campi di {fieldModule.label}</h3>
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Visibile</th>
                      <th>Modificabile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldModule.fields.map((f) => {
                      const p = draft.fields[f.id] ?? { visible: true, editable: true };
                      return (
                        <tr key={f.id}>
                          <td>{f.label}</td>
                          <td>
                            <input type="checkbox" checked={p.visible} onChange={(e) => setFieldPerm(f.id, 'visible', e.target.checked)} />
                          </td>
                          <td>
                            <input type="checkbox" checked={p.editable} onChange={(e) => setFieldPerm(f.id, 'editable', e.target.checked)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="actions">
              <button className="primary" onClick={saveProfile}>
                Salva permessi
              </button>
              {saved && <span className="ok">Salvato</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
