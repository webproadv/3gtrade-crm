import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { RecordPicker } from '../../components/RecordPicker';
import { ReportResultView } from '../../components/ReportResultView';
import { useSession } from '../../session';
import type { Aggregate, FilterOp, Report, ReportConfig, ReportResult } from '../../types';
import {
  AGG_LABELS,
  ColumnOption,
  DATES,
  GROUPABLE,
  NUMERIC,
  PERIOD_LABELS,
  columnOptions,
  opLabel,
  opsFor,
} from './reportOptions';

const emptyConfig = (cols: string[]): ReportConfig => ({
  columns: cols,
  filters: [],
  groupBy: null,
  groupOrder: 'key',
  totals: [],
  sort: null,
  chart: 'none',
});

export function ReportEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { modules, module: getModule } = useSession();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [shared, setShared] = useState(false);
  const [config, setConfig] = useState<ReportConfig>(emptyConfig([]));
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<ReportResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mod = getModule(moduleName);
  const options = useMemo(() => columnOptions(mod), [mod]);
  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);

  useEffect(() => {
    api('/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (!id) {
      const first = modules[0];
      if (first && !moduleName) changeModule(first.name);
      return;
    }
    api<Report>(`/reports/${id}`)
      .then((r) => {
        setName(r.name);
        setDescription(r.description);
        setModuleName(r.module);
        setShared(r.shared);
        setConfig({ ...emptyConfig([]), ...r.config });
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, modules.length]);

  function changeModule(name: string) {
    const m = getModule(name);
    setModuleName(name);
    setPreview(null);
    setConfig(emptyConfig(columnOptions(m).filter((o) => m?.fields.find((f) => f.name === o.key)?.inList).map((o) => o.key)));
  }

  const patch = (p: Partial<ReportConfig>) => {
    setConfig((c) => ({ ...c, ...p }));
    setPreview(null);
  };

  const toggleColumn = (key: string) =>
    patch({ columns: config.columns.includes(key) ? config.columns.filter((k) => k !== key) : [...config.columns, key] });
  const moveColumn = (i: number, d: -1 | 1) => {
    const cols = [...config.columns];
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    patch({ columns: cols });
  };

  const setFilter = (i: number, f: Partial<ReportConfig['filters'][number]>) =>
    patch({ filters: config.filters.map((x, k) => (k === i ? { ...x, ...f } : x)) });

  const toggleTotal = (field: string, fn: Aggregate) => {
    const has = config.totals.some((t) => t.field === field && t.fn === fn);
    patch({
      totals: has ? config.totals.filter((t) => !(t.field === field && t.fn === fn)) : [...config.totals, { field, fn }],
    });
  };

  const handle = (e: unknown) => {
    if (e instanceof ApiError && Object.keys(e.errors).length) {
      setErrors(e.errors);
      setError('Controlla i campi evidenziati.');
    } else setError((e as Error).message);
  };

  const runPreview = async () => {
    setBusy(true);
    setError('');
    setErrors({});
    try {
      setPreview(await api<ReportResult>('/reports/run', { method: 'POST', body: { module: moduleName, config } }));
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const body = { name, description, module: moduleName, shared, config };
      const r = await api<Report>(id ? `/reports/${id}` : '/reports', { method: id ? 'PATCH' : 'POST', body });
      nav(`/reports/${r.id}`);
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  };

  const numericFields = options.filter((o) => NUMERIC.has(o.type));
  const groupField = config.groupBy ? byKey.get(config.groupBy.field) : undefined;

  return (
    <div>
      <div className="crumbs">
        <Link to="/reports">Rapporti</Link>
      </div>
      <div className="page-head">
        <h1>{id ? 'Modifica rapporto' : 'Nuovo rapporto'}</h1>
        <div className="actions">
          <button onClick={runPreview} disabled={busy || !moduleName}>
            Anteprima
          </button>
          <button className="primary" onClick={save} disabled={busy || !moduleName}>
            Salva
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Generale</h2>
        <div className="form-grid">
          <label>
            <span>
              Nome <span className="req">*</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Opportunità per fase" />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label>
            <span>Modulo</span>
            <select value={moduleName} onChange={(e) => changeModule(e.target.value)}>
              {modules.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>Descrizione</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="check wide">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Condividi con tutti gli utenti (ognuno vede solo i record che i suoi permessi gli consentono)
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Colonne</h2>
        <div className="report-columns">
          <div className="checks">
            {options.map((o) => (
              <label key={o.key}>
                <input type="checkbox" checked={config.columns.includes(o.key)} onChange={() => toggleColumn(o.key)} />
                {o.label}
              </label>
            ))}
          </div>
          <ol className="column-order">
            {config.columns.map((k, i) => (
              <li key={k}>
                <span>{byKey.get(k)?.label ?? k}</span>
                <span className="actions">
                  <button className="link" onClick={() => moveColumn(i, -1)} disabled={i === 0} title="Sposta su">
                    ↑
                  </button>
                  <button className="link" onClick={() => moveColumn(i, 1)} disabled={i === config.columns.length - 1} title="Sposta giù">
                    ↓
                  </button>
                  <button className="link danger" onClick={() => toggleColumn(k)} title="Togli">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </div>
        {Object.entries(errors)
          .filter(([k]) => k.startsWith('columns'))
          .map(([k, v]) => (
            <div key={k} className="field-error">
              {v}
            </div>
          ))}
      </div>

      <div className="card">
        <h2>Filtri</h2>
        {config.filters.length === 0 && <p className="muted small">Nessun filtro: il rapporto include tutti i record che puoi vedere.</p>}
        {config.filters.map((f, i) => {
          const col = byKey.get(f.field);
          return (
            <div className="filter-row" key={i}>
              <select
                value={f.field}
                onChange={(e) => {
                  const c = byKey.get(e.target.value)!;
                  setFilter(i, { field: c.key, op: opsFor(c.type)[0], value: undefined });
                }}
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {col && (
                <select value={f.op} onChange={(e) => setFilter(i, { op: e.target.value as FilterOp, value: undefined })}>
                  {opsFor(col.type).map((op) => (
                    <option key={op} value={op}>
                      {opLabel(col.type, op)}
                    </option>
                  ))}
                </select>
              )}
              {col && f.op !== 'empty' && f.op !== 'notEmpty' && (
                <FilterValue col={col} op={f.op} value={f.value} users={users} onChange={(value) => setFilter(i, { value })} />
              )}
              <button className="link danger" onClick={() => patch({ filters: config.filters.filter((_, k) => k !== i) })}>
                Togli
              </button>
              {errors[`filters.${i}`] && <span className="field-error">{errors[`filters.${i}`]}</span>}
            </div>
          );
        })}
        <button
          onClick={() => {
            const c = options[0];
            if (c) patch({ filters: [...config.filters, { field: c.key, op: opsFor(c.type)[0] }] });
          }}
        >
          + Aggiungi filtro
        </button>
      </div>

      <div className="card">
        <h2>Raggruppamento, totali e grafico</h2>
        <div className="form-grid">
          <label>
            <span>Raggruppa per</span>
            <select
              value={config.groupBy?.field ?? ''}
              onChange={(e) =>
                patch({
                  groupBy: e.target.value ? { field: e.target.value } : null,
                  chart: e.target.value ? (config.chart === 'none' ? 'bar' : config.chart) : 'none',
                })
              }
            >
              <option value="">Nessun raggruppamento</option>
              {options
                .filter((o) => GROUPABLE.has(o.type))
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
            </select>
            {errors.groupBy && <span className="field-error">{errors.groupBy}</span>}
          </label>
          {groupField && DATES.has(groupField.type) && (
            <label>
              <span>Per</span>
              <select
                value={config.groupBy?.dateGroup ?? 'month'}
                onChange={(e) =>
                  patch({ groupBy: { field: groupField.key, dateGroup: e.target.value as 'day' | 'month' | 'year' } })
                }
              >
                <option value="day">giorno</option>
                <option value="month">mese</option>
                <option value="year">anno</option>
              </select>
            </label>
          )}
          {config.groupBy && (
            <label>
              <span>Ordine dei gruppi</span>
              <select value={config.groupOrder} onChange={(e) => patch({ groupOrder: e.target.value as 'key' | 'count' })}>
                <option value="key">per valore</option>
                <option value="count">dal più numeroso</option>
              </select>
            </label>
          )}
          {config.groupBy && (
            <label>
              <span>Grafico</span>
              <select value={config.chart} onChange={(e) => patch({ chart: e.target.value as ReportConfig['chart'] })}>
                <option value="none">nessuno</option>
                <option value="bar">a barre</option>
                <option value="pie">a torta</option>
              </select>
            </label>
          )}
        </div>
        {numericFields.length > 0 && (
          <>
            <h3>Totali</h3>
            <table className="table compact totals-grid">
              <tbody>
                {numericFields.map((o) => (
                  <tr key={o.key}>
                    <td>{o.label}</td>
                    {(Object.keys(AGG_LABELS) as Aggregate[]).map((fn) => (
                      <td key={fn}>
                        <label className="inline">
                          <input
                            type="checkbox"
                            checked={config.totals.some((t) => t.field === o.key && t.fn === fn)}
                            onChange={() => toggleTotal(o.key, fn)}
                          />
                          {AGG_LABELS[fn]}
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <h3>Ordina il dettaglio per</h3>
        <div className="filter-row">
          <select
            value={config.sort?.field ?? ''}
            onChange={(e) => patch({ sort: e.target.value ? { field: e.target.value, dir: config.sort?.dir ?? 'asc' } : null })}
          >
            <option value="">Ultima modifica</option>
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
      </div>

      {preview && (
        <div>
          <h2>Anteprima</h2>
          <ReportResultView result={preview} chart={config.chart} module={moduleName} />
        </div>
      )}
    </div>
  );
}

function FilterValue({
  col,
  op,
  value,
  users,
  onChange,
}: {
  col: ColumnOption;
  op: FilterOp;
  value: unknown;
  users: { id: string; name: string }[];
  onChange: (v: string | undefined) => void;
}) {
  const v = value === undefined || value === null ? '' : String(value);
  if (op === 'period') {
    return (
      <select value={v} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">scegli…</option>
        {Object.entries(PERIOD_LABELS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    );
  }
  if (DATES.has(col.type)) return <input type="date" value={v} onChange={(e) => onChange(e.target.value || undefined)} />;
  if (NUMERIC.has(col.type)) {
    return <input type="number" step="any" value={v} onChange={(e) => onChange(e.target.value || undefined)} />;
  }
  if (col.type === 'boolean') {
    return (
      <select value={v} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">scegli…</option>
        <option value="true">Sì</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (col.type === 'picklist' || col.type === 'multipicklist') {
    return (
      <select value={v} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">scegli…</option>
        {(col.values ?? []).map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    );
  }
  if (col.type === 'user') {
    return (
      <select value={v} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">scegli…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    );
  }
  if (col.type === 'relation' && col.relModule) {
    return (
      <span className="filter-picker">
        <RecordPicker module={col.relModule} value={v || null} onChange={(id) => onChange(id ?? undefined)} />
      </span>
    );
  }
  return <input value={v} onChange={(e) => onChange(e.target.value || undefined)} />;
}
