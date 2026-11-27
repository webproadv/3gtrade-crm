import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDateTime } from './format';

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  userName?: string;
  canDelete: boolean;
}

/** Commenti dei colleghi sulla scheda, come le "Conversazioni" di vtenext. */
export function Comments({ module, id }: { module: string; id: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const url = `/records/${module}/${id}/comments`;

  const load = () => api<Comment[]>(url).then(setItems).catch(() => setItems([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const send = async () => {
    if (!text.trim()) return;
    setError('');
    try {
      await api(url, { method: 'POST', body: { body: text } });
      setText('');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>
        Commenti <span className="muted">({items.length})</span>
      </h2>
      {items.length === 0 && <p className="muted small">Nessun commento.</p>}
      <ul className="comments">
        {items.map((c) => (
          <li key={c.id}>
            <div className="small">
              <strong>{c.userName ?? 'Tu'}</strong> <span className="muted">{formatDateTime(c.createdAt)}</span>
              {c.canDelete && (
                <button
                  className="link danger small"
                  onClick={async () => {
                    if (!window.confirm('Eliminare il commento?')) return;
                    await api(`${url}/${c.id}`, { method: 'DELETE' }).catch((e) => setError(e.message));
                    load();
                  }}
                >
                  Elimina
                </button>
              )}
            </div>
            <div className="comment-body">{c.body}</div>
          </li>
        ))}
      </ul>
      <div className="comment-new">
        <textarea rows={2} placeholder="Scrivi un commento per i colleghi…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={!text.trim()} onClick={send}>
          Invia
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </section>
  );
}
