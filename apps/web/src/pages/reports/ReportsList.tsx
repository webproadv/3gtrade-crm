import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatDate } from '../../components/format';
import type { ReportSummary } from '../../types';

export function ReportsList() {
  const nav = useNavigate();
  const [items, setItems] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ReportSummary[]>('/reports')
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-head">
        <h1>Rapporti</h1>
        <button className="primary" onClick={() => nav('/reports/new')}>
          Nuovo rapporto
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Modulo</th>
              <th>Creato da</th>
              <th>Visibilità</th>
              <th>Ultima modifica</th>
            </tr>
          </thead>
          <tbody>
            {items?.length === 0 && (
              <tr>
                <td className="empty muted" colSpan={5}>
                  Nessun rapporto. Crea il primo con "Nuovo rapporto".
                </td>
              </tr>
            )}
            {items?.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => nav(`/reports/${r.id}`)}>
                <td>
                  <Link to={`/reports/${r.id}`} onClick={(e) => e.stopPropagation()}>
                    {r.name}
                  </Link>
                  {r.description && <div className="muted small">{r.description}</div>}
                </td>
                <td>{r.moduleLabel}</td>
                <td>{r.ownerName}</td>
                <td>{r.shared ? <span className="tag">Condiviso</span> : <span className="muted">Privato</span>}</td>
                <td className="nowrap">{formatDate(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
