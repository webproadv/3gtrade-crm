import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { formatCurrency, formatDate } from '../components/format';
import { MyActivities } from '../components/MyActivities';
import { useSession } from '../session';
import type { ListResult } from '../types';

export function Home() {
  const { me, modules, module } = useSession();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [opps, setOpps] = useState<ListResult | null>(null);

  useEffect(() => {
    for (const m of modules) {
      api<ListResult>(`/records/${m.name}${qs({ pageSize: 1 })}`)
        .then((r) => setCounts((c) => ({ ...c, [m.name]: r.total })))
        .catch(() => undefined);
    }
    if (module('Opportunities')) {
      api<ListResult>(`/records/Opportunities${qs({ pageSize: 200, sort: 'close_date', dir: 'asc' })}`)
        .then(setOpps)
        .catch(() => undefined);
    }
  }, [modules, module]);

  const stages = module('Opportunities')?.fields.find((f) => f.name === 'sales_stage')?.options.values ?? [];
  const byStage = stages.map((s) => {
    const items = opps?.items.filter((o) => o.data.sales_stage === s) ?? [];
    return { stage: s, count: items.length, amount: items.reduce((a, o) => a + Number(o.data.amount ?? 0), 0) };
  });
  const maxAmount = Math.max(1, ...byStage.map((s) => s.amount));
  const open = opps?.items.filter((o) => !String(o.data.sales_stage).startsWith('Chiusa')) ?? [];

  return (
    <div>
      <h1>Buongiorno {me?.firstName}</h1>
      <div className="tiles">
        {modules.map((m) => (
          <Link key={m.name} to={`/m/${m.name}`} className="tile">
            <div className="tile-value">{counts[m.name] ?? '…'}</div>
            <div className="tile-label">{m.label}</div>
          </Link>
        ))}
      </div>
      <MyActivities />
      {opps && (
        <div className="grid-2">
          <section className="card">
            <h2>Pipeline per fase</h2>
            {byStage.map((s) => (
              <div key={s.stage} className="bar-row">
                <span className="bar-label">{s.stage}</span>
                <span className="bar-track">
                  <span className="bar" style={{ width: `${(s.amount / maxAmount) * 100}%` }} />
                </span>
                <span className="bar-value">
                  {formatCurrency(s.amount)} <span className="muted">({s.count})</span>
                </span>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Prossime chiusure</h2>
            {open.length === 0 && <p className="muted">Nessuna opportunità aperta.</p>}
            <table className="table compact">
              <tbody>
                {open.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/m/Opportunities/${o.id}`}>{o.label}</Link>
                    </td>
                    <td>{o.data.close_date ? formatDate(String(o.data.close_date)) : '—'}</td>
                    <td className="num">{o.data.amount != null ? formatCurrency(Number(o.data.amount)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
