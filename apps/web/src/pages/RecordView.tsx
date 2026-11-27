import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { groupByBlock } from '../components/blocks';
import { Comments } from '../components/Comments';
import { ConvertLead } from '../components/ConvertLead';
import { FieldValue } from '../components/FieldValue';
import { formatDateTime } from '../components/format';
import { LinesEditor } from '../components/LinesEditor';
import { useSession } from '../session';
import type { CrmRecord, ListResult } from '../types';

interface Related extends ListResult {
  module: string;
  label: string;
  field: string;
  fieldLabel: string;
}

interface HistoryItem {
  id: number;
  action: 'create' | 'update' | 'delete';
  userName: string;
  createdAt: string;
  changes: Record<string, [unknown, unknown]>;
}

const ACTIONS = { create: 'ha creato il record', update: 'ha modificato', delete: 'ha eliminato il record' };

export function RecordView() {
  const { module: name = '', id = '' } = useParams();
  const { module } = useSession();
  const mod = module(name);
  const nav = useNavigate();
  const [rec, setRec] = useState<CrmRecord | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [error, setError] = useState('');
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    setRec(null);
    setConverting(false);
    setError('');
    api<CrmRecord>(`/records/${name}/${id}`).then(setRec).catch((e) => setError(e.message));
    api<Related[]>(`/records/${name}/${id}/related`).then(setRelated).catch(() => setRelated([]));
    api<HistoryItem[]>(`/records/${name}/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }, [name, id]);

  if (error) return <div className="error">{error}</div>;
  if (!mod || !rec) return <p className="muted">Caricamento…</p>;

  const remove = async () => {
    if (!window.confirm('Eliminare questo record?')) return;
    try {
      await api(`/records/${name}/${id}`, { method: 'DELETE' });
      nav(`/m/${name}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const reload = () => {
    api<CrmRecord>(`/records/${name}/${id}`).then(setRec).catch((e) => setError(e.message));
    api<HistoryItem[]>(`/records/${name}/${id}/history`).then(setHistory).catch(() => undefined);
  };
  // nei documenti con righe i totali si mostrano sotto le righe, non come blocco a sé
  const totalsBlock = mod.lineTotals && mod.fields.find((f) => f.name === mod.lineTotals!.total)?.block;
  const fieldLabel = (n: string) => (n === 'ownerId' ? 'Assegnato a' : mod.fields.find((f) => f.name === n)?.label ?? n);

  return (
    <div>
      <div className="crumbs">
        <Link to={`/m/${name}`}>{mod.label}</Link>
      </div>
      <div className="page-head">
        <h1>{rec.label || '(senza nome)'}</h1>
        <div className="actions">
          {name === 'Activities' && rec.permissions?.edit && rec.data.status === 'Pianificata' && (
            <button
              onClick={async () => {
                try {
                  setRec(await api<CrmRecord>(`/records/${name}/${id}`, { method: 'PATCH', body: { data: { status: 'Completata' } } }));
                  setHistory(await api<HistoryItem[]>(`/records/${name}/${id}/history`));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Segna come completata
            </button>
          )}
          {name === 'Leads' && rec.permissions?.edit && !rec.data.converted_at && !converting && (
            <button className="primary" onClick={() => setConverting(true)}>
              Converti
            </button>
          )}
          {mod.hasLines && (
            <button onClick={() => window.open(`/m/${name}/${id}/print`, '_blank')}>Stampa</button>
          )}
          {rec.permissions?.edit && (
            <button className="primary" onClick={() => nav(`/m/${name}/${id}/edit`)}>
              Modifica
            </button>
          )}
          {rec.permissions?.delete && (
            <button className="danger" onClick={remove}>
              Elimina
            </button>
          )}
        </div>
      </div>
      <div className="meta muted small">
        Assegnato a {rec.refs?.users[rec.ownerId]} · creato il {formatDateTime(rec.createdAt)} · modificato il{' '}
        {formatDateTime(rec.updatedAt)}
      </div>
      <div className="tabs">
        <button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>
          Dettagli
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          Storico ({history.length})
        </button>
      </div>

      {converting && (
        <ConvertLead
          lead={rec}
          onCancel={() => setConverting(false)}
          onDone={(r) => nav(r.opportunityId ? `/m/Opportunities/${r.opportunityId}` : `/m/Accounts/${r.accountId}`)}
        />
      )}

      {tab === 'details' && (
        <>
          {groupByBlock(mod.fields.filter((f) => f.block !== totalsBlock || !mod.hasLines)).map(([block, fields]) => (
            <section key={block} className="card">
              <h2>{block}</h2>
              <dl className="fields">
                {fields.map((f) => (
                  <div key={f.name} className={f.type === 'textarea' ? 'wide' : ''}>
                    <dt>{f.label}</dt>
                    <dd>
                      <FieldValue field={f} value={rec.data[f.name]} refs={rec.refs} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {mod.hasLines && <LinesEditor mod={mod} rec={rec} onSaved={reload} />}
          <Comments module={name} id={id} />
          {related.map((r) => {
            const relMod = module(r.module);
            const cols =
              relMod?.fields
                .filter((f) => f.inList && f.name !== r.field && !relMod.labelFields.includes(f.name))
                .slice(0, 4) ?? [];
            return (
              <section key={`${r.module}.${r.field}`} className="card">
                <div className="section-head">
                  <h2>
                    {r.label} <span className="muted">({r.total})</span>
                  </h2>
                  {/* i collegamenti calcolati dal sistema (es. lead convertito) non si creano da qui */}
                  {relMod?.permissions?.create && relMod.fields.find((f) => f.name === r.field)?.editable !== false && (
                    <button onClick={() => nav(`/m/${r.module}/new?${r.field}=${id}`)}>Aggiungi</button>
                  )}
                </div>
                {r.items.length === 0 ? (
                  <p className="muted">Nessun elemento collegato.</p>
                ) : (
                  <table className="table compact">
                    <tbody>
                      {r.items.map((it) => (
                        <tr key={it.id}>
                          <td>
                            <Link to={`/m/${r.module}/${it.id}`}>{it.label || '(senza nome)'}</Link>
                          </td>
                          {cols.map((c) => (
                            <td key={c.name}>
                              <FieldValue field={c} value={it.data[c.name]} refs={r.refs} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </>
      )}

      {tab === 'history' && (
        <section className="card">
          <ul className="history">
            {history.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{h.userName}</strong> {ACTIONS[h.action]}{' '}
                  <span className="muted small">{formatDateTime(h.createdAt)}</span>
                </div>
                {h.action === 'update' && (
                  <ul>
                    {Object.entries(h.changes).map(([k, [from, to]]) => (
                      <li key={k}>
                        {fieldLabel(k)}: <span className="muted">{String(from ?? '—')}</span> →{' '}
                        <strong>{String(to ?? '—')}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
