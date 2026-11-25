import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { useSession } from '../session';
import type { CrmRecord, ListResult } from '../types';
import { dayKey, formatDate, formatTime } from './format';

/** Attività pianificate dell'utente: in ritardo, di oggi e dei prossimi 7 giorni. */
export function MyActivities() {
  const { me, module } = useSession();
  const mod = module('Activities');
  const [data, setData] = useState<ListResult | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!me || !mod) return;
    const until = new Date();
    until.setDate(until.getDate() + 7);
    until.setHours(23, 59, 59, 999);
    api<ListResult>(
      `/records/Activities${qs({
        ownerId: me.id,
        filter: { status: 'Pianificata' },
        before: { start: until.toISOString() },
        sort: 'start',
        dir: 'asc',
        pageSize: 50,
      })}`,
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, [me, mod]);

  useEffect(load, [load]);

  if (!mod) return null;

  const complete = async (a: CrmRecord) => {
    try {
      await api(`/records/Activities/${a.id}`, { method: 'PATCH', body: { data: { status: 'Completata' } } });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const today = dayKey(new Date());
  const groups: [string, CrmRecord[]][] = [
    ['In ritardo', []],
    ['Oggi', []],
    ['Prossimi giorni', []],
  ];
  for (const a of data?.items ?? []) {
    const k = dayKey(new Date(String(a.data.start)));
    groups[k < today ? 0 : k === today ? 1 : 2][1].push(a);
  }

  return (
    <section className="card">
      <div className="section-head">
        <h2>Le mie attività</h2>
        <Link to="/calendar">Apri il calendario</Link>
      </div>
      {error && <div className="error">{error}</div>}
      {data && data.items.length === 0 && <p className="muted">Nessuna attività in programma. </p>}
      {groups
        .filter(([, items]) => items.length)
        .map(([title, items]) => (
          <div key={title} className="act-group">
            <h3 className={title === 'In ritardo' ? 'overdue' : ''}>
              {title} <span className="muted">({items.length})</span>
            </h3>
            <ul className="act-list">
              {items.map((a) => (
                <li key={a.id}>
                  {mod.permissions?.edit && (
                    <input
                      type="checkbox"
                      title="Segna come completata"
                      aria-label={`Completa ${a.label}`}
                      onChange={() => complete(a)}
                    />
                  )}
                  <span className="cal-item legend" data-type={String(a.data.activity_type ?? '')}>
                    {String(a.data.activity_type ?? '')}
                  </span>
                  <Link to={`/m/Activities/${a.id}`}>{a.label}</Link>
                  <span className="muted small">
                    {title === 'Oggi' ? '' : `${formatDate(String(a.data.start))} `}
                    {a.data.all_day ? '' : formatTime(String(a.data.start))}
                  </span>
                  {typeof a.data.account_id === 'string' && data?.refs.records[a.data.account_id] && (
                    <Link className="small" to={`/m/Accounts/${a.data.account_id}`}>
                      {data.refs.records[a.data.account_id].label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
