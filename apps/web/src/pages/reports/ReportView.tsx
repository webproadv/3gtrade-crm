import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../../api';
import { ReportResultView } from '../../components/ReportResultView';
import type { Report, ReportResult } from '../../types';

export function ReportView() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<{ report: Report; result: ReportResult } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError('');
    api<{ report: Report; result: ReportResult }>(`/reports/${id}/run`)
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [id]);

  const exportCsv = async (part: 'rows' | 'summary') => {
    setBusy(true);
    try {
      await download(`/reports/${id}/export?part=${part}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Eliminare questo rapporto? I dati dei record non vengono toccati.')) return;
    try {
      await api(`/reports/${id}`, { method: 'DELETE' });
      nav('/reports');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error && !data) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Caricamento…</p>;
  const { report, result } = data;

  return (
    <div>
      <div className="crumbs">
        <Link to="/reports">Rapporti</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>{report.name}</h1>
          {report.description && <div className="muted">{report.description}</div>}
        </div>
        <div className="actions">
          <button onClick={load}>Aggiorna</button>
          <button onClick={() => exportCsv('rows')} disabled={busy}>
            Esporta per Excel
          </button>
          {result.groups && (
            <button onClick={() => exportCsv('summary')} disabled={busy}>
              Esporta riepilogo
            </button>
          )}
          {report.canEdit && <button onClick={() => nav(`/reports/${id}/edit`)}>Modifica</button>}
          {report.canEdit && (
            <button className="danger" onClick={remove}>
              Elimina
            </button>
          )}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <ReportResultView result={result} chart={report.config.chart} module={report.module} />
    </div>
  );
}
