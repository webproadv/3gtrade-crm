import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { groupByBlock } from '../components/blocks';
import { FieldInput } from '../components/FieldInput';
import { useSession } from '../session';
import type { CrmRecord, Refs } from '../types';

export function RecordForm() {
  const { module: name = '', id } = useParams();
  const [sp] = useSearchParams();
  const { module, me } = useSession();
  const mod = module(name);
  const nav = useNavigate();
  const [data, setData] = useState<Record<string, unknown>>({});
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  const [ownerId, setOwnerId] = useState('');
  const [refs, setRefs] = useState<Refs | undefined>();
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/users').then(setUsers).catch(() => setUsers([]));
    if (id) {
      api<CrmRecord>(`/records/${name}/${id}`).then((r) => {
        setData(r.data);
        setOriginal(r.data);
        setOwnerId(r.ownerId);
        setRefs(r.refs);
      });
    } else {
      // precompilazione da query string, es. ?account_id=... dalle liste correlate
      const initial: Record<string, unknown> = {};
      for (const [k, v] of sp.entries()) initial[k] = v;
      setData(initial);
      setOwnerId(me?.id ?? '');
      const relIds = Object.values(initial).filter((v): v is string => typeof v === 'string');
      Promise.all(
        (mod?.fields ?? [])
          .filter((f) => f.type === 'relation' && relIds.includes(String(initial[f.name])))
          .map((f) =>
            api<CrmRecord>(`/records/${f.options.module}/${initial[f.name]}`).then((r) => [r.id, r] as const),
          ),
      )
        .then((rs) =>
          setRefs({ records: Object.fromEntries(rs.map(([rid, r]) => [rid, { label: r.label, module: r.module }])), users: {} }),
        )
        .catch(() => undefined);
    }
  }, [name, id, sp, me, mod]);

  if (!mod) return <p>Modulo non disponibile.</p>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    // in modifica invia solo i campi cambiati
    const payload: Record<string, unknown> = {};
    for (const f of mod.fields) {
      if (f.editable === false) continue;
      const v = data[f.name];
      if (id ? JSON.stringify(v ?? null) !== JSON.stringify(original[f.name] ?? null) : v !== undefined && v !== '') {
        payload[f.name] = v ?? null;
      }
    }
    try {
      const body = { data: payload, ownerId: ownerId || undefined };
      const r = id
        ? await api<CrmRecord>(`/records/${name}/${id}`, { method: 'PATCH', body })
        : await api<CrmRecord>(`/records/${name}`, { method: 'POST', body });
      nav(`/m/${name}/${r.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setError(err.message);
      } else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="crumbs">
        <Link to={`/m/${name}`}>{mod.label}</Link>
      </div>
      <div className="page-head">
        <h1>{id ? `Modifica ${mod.labelSingular.toLowerCase()}` : `Nuovo ${mod.labelSingular.toLowerCase()}`}</h1>
        <div className="actions">
          <button type="button" onClick={() => nav(-1)}>
            Annulla
          </button>
          <button className="primary" disabled={busy}>
            Salva
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {groupByBlock(mod.fields).map(([block, fields]) => (
        <section key={block} className="card">
          <h2>{block}</h2>
          <div className="form-grid">
            {fields.map((f) => (
              <label key={f.name} className={f.type === 'textarea' || f.type === 'multipicklist' ? 'wide' : ''}>
                <span>
                  {f.label}
                  {f.required && <span className="req"> *</span>}
                </span>
                <FieldInput
                  field={f}
                  value={data[f.name]}
                  refs={refs}
                  users={users}
                  onChange={(v) => setData((d) => ({ ...d, [f.name]: v }))}
                />
                {errors[f.name] && <span className="field-error">{errors[f.name]}</span>}
              </label>
            ))}
          </div>
        </section>
      ))}
      <section className="card">
        <h2>Assegnazione</h2>
        <div className="form-grid">
          <label>
            <span>Assegnato a</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {errors.ownerId && <span className="field-error">{errors.ownerId}</span>}
          </label>
        </div>
      </section>
    </form>
  );
}
