import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatDateTime } from '../../components/format';
import { useSession } from '../../session';
import type { Workflow } from '../../types';
import { triggerSummary } from './workflowText';

/** Elenco dei workflow, come "Processi e workflow" di vtenext. */
export function AdminWorkflows() {
  const { module } = useSession();
  const nav = useNavigate();
  const [items, setItems] = useState<Workflow[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () =>
    api<Workflow[]>('/workflows')
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const toggle = async (w: Workflow) => {
    setError('');
    try {
      const { id: _i, lastRunAt: _l, runs: _r, errors: _e, ...body } = w;
      await api(`/workflows/${w.id}`, { method: 'PATCH', body: { ...body, active: !w.active } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const runScheduled = async () => {
    setInfo('');
    try {
      const r = await api<{ runs: number }>('/workflows/run-scheduled', { method: 'POST', body: {} });
      setInfo(r.runs ? `Eseguiti ${r.runs} workflow a tempo.` : 'Nessuna scadenza da eseguire adesso.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Workflow</h1>
        <div className="actions">
          <button onClick={runScheduled}>Esegui ora i controlli a tempo</button>
          <button className="primary" onClick={() => nav('/admin/workflows/new')}>
            Nuovo workflow
          </button>
        </div>
      </div>
      <p className="muted small">
        Regole automatiche: quando succede qualcosa su un record (o a una scadenza), se le condizioni sono vere, il CRM
        esegue le azioni. Le email per i clienti non partono mai da sole: restano bozze da inviare dalla scheda.
      </p>
      {error && <div className="error">{error}</div>}
      {info && <div className="notice">{info}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Modulo</th>
              <th>Quando</th>
              <th>Attivo</th>
              <th>Esecuzioni</th>
              <th>Ultima</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link to={`/admin/workflows/${w.id}`}>{w.name}</Link>
                </td>
                <td>{module(w.module)?.label ?? w.module}</td>
                <td>{triggerSummary(module(w.module), w.trigger)}</td>
                <td>
                  <input type="checkbox" checked={w.active} onChange={() => toggle(w)} aria-label="Attivo" />
                </td>
                <td>
                  {w.runs ?? 0}
                  {!!w.errors && <span className="danger-text"> ({w.errors} con errori)</span>}
                </td>
                <td className="muted">{w.lastRunAt ? formatDateTime(w.lastRunAt) : '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted empty">
                  Nessun workflow.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
