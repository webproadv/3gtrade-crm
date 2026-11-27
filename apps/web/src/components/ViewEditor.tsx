import { useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import { columnOptions } from '../pages/reports/reportOptions';
import type { ListViewDef, Module, ViewConfig } from '../types';
import { ConditionsEditor } from './ConditionsEditor';

/** Crea o modifica una vista salvata della lista: nome, visibilità, colonne, filtri e ordinamento. */
export function ViewEditor({
  mod,
  view,
  initial,
  users,
  onSaved,
  onDeleted,
  onCancel,
}: {
  mod: Module;
  view: ListViewDef | null;
  initial: ViewConfig;
  users: { id: string; name: string }[];
  onSaved: (v: ListViewDef) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const options = useMemo(() => columnOptions(mod), [mod]);
  const [name, setName] = useState(view?.name ?? '');
  const [shared, setShared] = useState(view?.shared ?? false);
  const [config, setConfig] = useState<ViewConfig>(view?.config ?? initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const patch = (p: Partial<ViewConfig>) => setConfig((c) => ({ ...c, ...p }));
  const toggleColumn = (key: string) =>
    patch({ columns: config.columns.includes(key) ? config.columns.filter((c) => c !== key) : [...config.columns, key] });

  const save = async () => {
    setErrors({});
    setError('');
    try {
      const body = { name, module: mod.name, shared, config };
      const saved = view
        ? await api<ListViewDef>(`/list-views/${view.id}`, { method: 'PATCH', body })
        : await api<ListViewDef>('/list-views', { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.errors);
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!view || !window.confirm(`Eliminare la vista "${view.name}"?`)) return;
    try {
      await api(`/list-views/${view.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>{view ? 'Modifica vista' : 'Nuova vista'}</h2>
      <div className="form-grid">
        <label>
          <span>Nome della vista</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Da richiamare questa settimana" />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <label className="check">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Pubblica: visibile a tutti i colleghi (ognuno vede solo i record che gli sono permessi)
        </label>
      </div>

      <h3>Colonne</h3>
      <div className="checks">
        {options.map((o) => (
          <label key={o.key}>
            <input type="checkbox" checked={config.columns.includes(o.key)} onChange={() => toggleColumn(o.key)} />
            {o.label}
          </label>
        ))}
      </div>
      {errors.columns && <span className="field-error">{errors.columns}</span>}

      <h3>Filtri</h3>
      {config.filters.length === 0 && <p className="muted small">Nessun filtro: la vista mostra tutti i record che puoi vedere.</p>}
      <ConditionsEditor
        mod={mod}
        filters={config.filters}
        users={users}
        errors={errors}
        onChange={(filters) => patch({ filters })}
      />

      <h3>Ordinamento</h3>
      <div className="filter-row">
        <select
          value={config.sort?.field ?? ''}
          onChange={(e) => patch({ sort: e.target.value ? { field: e.target.value, dir: config.sort?.dir ?? 'asc' } : null })}
        >
          <option value="">Ultime modifiche prima</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        {config.sort && (
          <select value={config.sort.dir} onChange={(e) => patch({ sort: { ...config.sort!, dir: e.target.value as 'asc' | 'desc' } })}>
            <option value="asc">crescente</option>
            <option value="desc">decrescente</option>
          </select>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="primary" onClick={save}>
          Salva vista
        </button>
        <button onClick={onCancel}>Annulla</button>
        {view?.canEdit && (
          <button className="danger" onClick={remove}>
            Elimina vista
          </button>
        )}
      </div>
    </section>
  );
}
