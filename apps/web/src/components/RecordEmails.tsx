import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { RecordEmail } from '../types';
import { formatDateTime } from './format';

const STATUS: Record<RecordEmail['status'], string> = {
  draft: 'Bozza da inviare',
  queued: 'In coda',
  sent: 'Inviata',
  failed: 'Non inviata',
};

/**
 * Email della scheda. Quelle preparate dai workflow per i clienti sono bozze:
 * l'utente le controlla, le corregge e le invia con il pulsante (nulla parte da solo).
 */
export function RecordEmails({
  module,
  id,
  canEdit,
  reloadKey,
  defaultTo,
}: {
  module: string;
  id: string;
  canEdit: boolean;
  reloadKey: number;
  defaultTo: string;
}) {
  const [items, setItems] = useState<RecordEmail[]>([]);
  const [canSend, setCanSend] = useState(true);
  const url = `/records/${module}/${id}/emails`;
  const load = () =>
    api<{ items: RecordEmail[]; canSend: boolean }>(url)
      .then((r) => {
        setItems(r.items);
        setCanSend(r.canSend);
      })
      .catch(() => setItems([]));

  useEffect(() => {
    void load();
    // i workflow girano subito dopo il salvataggio: un secondo controllo mostra le bozze appena preparate
    const t = setTimeout(() => void load(), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);

  const drafts = items.filter((e) => e.status === 'draft' || e.status === 'failed');
  const others = items.filter((e) => e.status !== 'draft' && e.status !== 'failed');
  if (!items.length && !canEdit) return null;

  return (
    <section className="card">
      <h2>
        Email <span className="muted">({items.length})</span>
      </h2>
      {!canSend && drafts.length > 0 && (
        <p className="notice small">L'invio delle email non è ancora configurato: chiedi all'amministratore.</p>
      )}
      {drafts.map((e) => (
        <Draft key={e.id} url={url} email={e} canEdit={canEdit} onChange={load} />
      ))}
      {others.length > 0 && (
        <ul className="emails">
          {others.map((e) => (
            <li key={e.id}>
              <details>
                <summary>
                  <strong>{e.subject || '(senza oggetto)'}</strong> <span className="muted">a {e.to}</span> ·{' '}
                  <span className={e.status === 'sent' ? '' : 'muted'}>{STATUS[e.status]}</span>
                  <span className="muted small">
                    {' '}
                    {formatDateTime(e.sentAt ?? e.createdAt)}
                    {e.sentByName ? ` da ${e.sentByName}` : ''}
                  </span>
                </summary>
                <pre className="email-body">{e.body}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 && <p className="muted small">Nessuna email.</p>}
      {canEdit && (
        <button
          onClick={async () => {
            await api(url, { method: 'POST', body: { to: defaultTo, subject: '', body: '' } });
            await load();
          }}
        >
          + Nuova email
        </button>
      )}
    </section>
  );
}

function Draft({ url, email, canEdit, onChange }: { url: string; email: RecordEmail; canEdit: boolean; onChange: () => void }) {
  const [form, setForm] = useState({ to: email.to, subject: email.subject, body: email.body });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(email.status === 'failed' ? (email.error ?? 'Invio non riuscito') : '');
  const [busy, setBusy] = useState(false);
  const dirty = form.to !== email.to || form.subject !== email.subject || form.body !== email.body;

  const call = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErrors({});
    setError('');
    try {
      await fn();
      onChange();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.errors);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => api(`${url}/${email.id}`, { method: 'PATCH', body: form });

  return (
    <div className="email-draft">
      <div className="muted small">
        {email.workflowName ? `Preparata dal workflow "${email.workflowName}"` : 'Bozza'} · {formatDateTime(email.createdAt)}
      </div>
      <label>
        <span>A</span>
        <input value={form.to} disabled={!canEdit} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        {errors.to && <span className="field-error">{errors.to}</span>}
      </label>
      <label>
        <span>Oggetto</span>
        <input value={form.subject} disabled={!canEdit} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        {errors.subject && <span className="field-error">{errors.subject}</span>}
      </label>
      <label>
        <span>Testo</span>
        <textarea rows={6} value={form.body} disabled={!canEdit} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </label>
      {error && <div className="error">{error}</div>}
      {canEdit && (
        <div className="actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              call(async () => {
                if (!window.confirm(`Inviare l'email a ${form.to || '(nessun indirizzo)'}?`)) return;
                if (dirty) await save();
                await api(`${url}/${email.id}/send`, { method: 'POST', body: {} });
              })
            }
          >
            Invia
          </button>
          <button disabled={busy || !dirty} onClick={() => call(save)}>
            Salva bozza
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() =>
              call(async () => {
                if (window.confirm('Scartare questa bozza?')) await api(`${url}/${email.id}/discard`, { method: 'POST', body: {} });
              })
            }
          >
            Scarta
          </button>
        </div>
      )}
    </div>
  );
}
