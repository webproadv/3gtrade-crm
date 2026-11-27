import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { FieldValue } from '../components/FieldValue';
import { formatDateTime } from '../components/format';
import { ViewEditor } from '../components/ViewEditor';
import { useSession } from '../session';
import type { ListViewDef, ViewConfig, ViewPage } from '../types';

/**
 * Lista dei record con viste salvate come in vtenext: "Tutti" più le viste personali e pubbliche
 * (filtri, colonne e ordinamento), filtro "Assegnato a" e ricerca per nome.
 */
export function ListView() {
  const { module: name = '' } = useParams();
  const { module, me } = useSession();
  const mod = module(name);
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState<ViewPage | null>(null);
  const [views, setViews] = useState<ListViewDef[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<'new' | 'edit' | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(sp.get('q') ?? '');
  const [reload, setReload] = useState(0);

  const viewId = sp.get('view') ?? '';
  const owner = sp.get('owner') ?? '';
  const q = sp.get('q') ?? '';
  const sort = sp.get('sort') ?? '';
  const dir = (sp.get('dir') as 'asc' | 'desc') ?? 'asc';
  const page = Number(sp.get('page') ?? 1);
  const view = views.find((v) => v.id === viewId) ?? null;

  // vista "Tutti": i campi da mostrare in lista più l'assegnatario
  const defaultConfig = useMemo<ViewConfig>(
    () => ({ columns: [...(mod?.fields.filter((f) => f.inList).map((f) => f.name) ?? []), 'ownerId'], filters: [], sort: null }),
    [mod],
  );

  useEffect(() => {
    setEditing(null);
    api<ListViewDef[]>(`/list-views?module=${encodeURIComponent(name)}`).then(setViews).catch(() => setViews([]));
  }, [name]);
  useEffect(() => {
    api('/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (!mod) return;
    setError('');
    api<ViewPage>('/list-views/query', {
      method: 'POST',
      body: {
        module: name,
        ...(viewId ? { viewId } : { config: defaultConfig }),
        ...(sort ? { sort: { field: sort, dir } } : {}),
        q: q || undefined,
        owner: owner || undefined,
        page,
        pageSize: 25,
      },
    })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [name, mod, viewId, owner, q, sort, dir, page, defaultConfig, reload]);

  useEffect(() => setSearch(q), [q, name]);

  if (!mod) return <p>Modulo non disponibile.</p>;
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    setSp(next);
  };
  const toggleSort = (field: string) => update({ sort: field, dir: sort === field && dir === 'asc' ? 'desc' : 'asc', page: '' });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const fieldOf = (key: string) => mod.fields.find((f) => f.name === key);
  const mine = views.filter((v) => !v.shared);
  const shared = views.filter((v) => v.shared);

  return (
    <div>
      <div className="page-head">
        <h1>{mod.label}</h1>
        {mod.permissions?.create && (
          <button className="primary" onClick={() => nav(`/m/${name}/new`)}>
            Nuovo {mod.labelSingular.toLowerCase()}
          </button>
        )}
      </div>
      <form
        className="toolbar wrap"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search, page: '' });
        }}
      >
        <label className="inline">
          <span className="muted small">Vista</span>
          <select value={viewId} onChange={(e) => update({ view: e.target.value, sort: '', dir: '', page: '' })}>
            <option value="">Tutti</option>
            {mine.length > 0 && (
              <optgroup label="Le mie viste">
                {mine.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
            {shared.length > 0 && (
              <optgroup label="Pubbliche">
                {shared.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.ownerName ? ` [${v.ownerName}]` : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {view?.canEdit && (
          <button type="button" className="link" onClick={() => setEditing('edit')}>
            Modifica vista
          </button>
        )}
        <button type="button" className="link" onClick={() => setEditing('new')}>
          + Nuova vista
        </button>
        <label className="inline">
          <span className="muted small">Assegnato a</span>
          <select value={owner} onChange={(e) => update({ owner: e.target.value, page: '' })}>
            <option value="">Tutti</option>
            <option value="mine">A me</option>
            <option value="others">Agli altri</option>
            {users
              .filter((u) => u.id !== me?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
        <input placeholder={`Cerca in ${mod.label.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button>Cerca</button>
        {data && <span className="muted">{data.total} risultati</span>}
      </form>

      {editing && (
        <ViewEditor
          key={editing + (view?.id ?? '')}
          mod={mod}
          view={editing === 'edit' ? view : null}
          initial={view && editing === 'new' ? { ...view.config } : defaultConfig}
          users={users}
          onCancel={() => setEditing(null)}
          onSaved={(v) => {
            setViews((all) => [...all.filter((x) => x.id !== v.id), v].sort((a, b) => a.name.localeCompare(b.name)));
            setEditing(null);
            update({ view: v.id, sort: '', dir: '', page: '' });
            setReload((n) => n + 1);
          }}
          onDeleted={() => {
            setViews((all) => all.filter((x) => x.id !== viewId));
            setEditing(null);
            update({ view: '', page: '' });
          }}
        />
      )}

      {error && <div className="error">{error}</div>}
      {data && data.hidden.length > 0 && (
        <p className="muted small">Campi della vista che non puoi vedere, ignorati: {data.hidden.join(', ')}</p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {data?.columns.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} className="sortable">
                  {c.label} {sort === c.key ? (dir === 'asc' ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id} onClick={() => nav(`/m/${name}/${r.id}`)} className="clickable">
                {data.columns.map((c, i) => {
                  const f = fieldOf(c.key);
                  const cell =
                    c.key === 'ownerId' ? (
                      data.refs.users[r.ownerId]
                    ) : c.key === 'createdAt' || c.key === 'updatedAt' ? (
                      formatDateTime(c.key === 'createdAt' ? r.createdAt : r.updatedAt)
                    ) : f ? (
                      <FieldValue field={f} value={r.data[c.key]} refs={data.refs} />
                    ) : null;
                  return (
                    <td key={c.key}>
                      {i === 0 ? (
                        <Link to={`/m/${name}/${r.id}`} onClick={(e) => e.stopPropagation()}>
                          {r.data[c.key] != null && f && ['text', 'email', 'phone'].includes(f.type)
                            ? String(r.data[c.key])
                            : r.label || '(senza nome)'}
                        </Link>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={data.columns.length || 1} className="muted empty">
                  Nessun record trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            ‹ Precedente
          </button>
          <span>
            Pagina {page} di {pages}
          </span>
          <button disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
            Successiva ›
          </button>
        </div>
      )}
    </div>
  );
}
