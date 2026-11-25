import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { FieldValue } from '../components/FieldValue';
import { useSession } from '../session';
import type { ListResult } from '../types';

export function ListView() {
  const { module: name = '' } = useParams();
  const { module } = useSession();
  const mod = module(name);
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState<ListResult | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(sp.get('q') ?? '');

  const q = sp.get('q') ?? '';
  const sort = sp.get('sort') ?? '';
  const dir = (sp.get('dir') as 'asc' | 'desc') ?? 'desc';
  const page = Number(sp.get('page') ?? 1);

  useEffect(() => {
    setError('');
    api<ListResult>(`/records/${name}${qs({ q, sort, dir, page, pageSize: 25 })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [name, q, sort, dir, page]);

  useEffect(() => setSearch(q), [q, name]);

  if (!mod) return <p>Modulo non disponibile.</p>;
  const columns = mod.fields.filter((f) => f.inList);
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    setSp(next);
  };
  const toggleSort = (field: string) =>
    update({ sort: field, dir: sort === field && dir === 'asc' ? 'desc' : 'asc', page: '' });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

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
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search, page: '' });
        }}
      >
        <input placeholder={`Cerca in ${mod.label.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button>Cerca</button>
        {data && <span className="muted">{data.total} risultati</span>}
      </form>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.name} onClick={() => toggleSort(c.name)} className="sortable">
                  {c.label} {sort === c.name ? (dir === 'asc' ? '▲' : '▼') : ''}
                </th>
              ))}
              <th>Assegnato a</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id} onClick={() => nav(`/m/${name}/${r.id}`)} className="clickable">
                {columns.map((c, i) => (
                  <td key={c.name}>
                    {i === 0 ? (
                      <Link to={`/m/${name}/${r.id}`} onClick={(e) => e.stopPropagation()}>
                        {r.data[c.name] != null ? String(r.data[c.name]) : r.label || '(senza nome)'}
                      </Link>
                    ) : (
                      <FieldValue field={c} value={r.data[c.name]} refs={data.refs} />
                    )}
                  </td>
                ))}
                <td>{data.refs.users[r.ownerId]}</td>
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="muted empty">
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
