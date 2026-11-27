import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { FieldValue } from './FieldValue';
import type { Module, ViewConfig, ViewPage } from '../types';

/** Campo a colonne per modulo (la "Vista d'insieme" di vtenext) e importo da sommare per colonna. */
export const BOARD_FIELDS: Record<string, { field: string; amount?: string }> = {
  Opportunities: { field: 'sales_stage', amount: 'amount' },
  Leads: { field: 'lead_status', amount: 'budget' },
  SalesOrders: { field: 'status', amount: 'grand_total' },
};

const MAX_CARDS = 200;
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * Record in colonne per valore del campo (es. fase di vendita): trascinando una scheda
 * in un'altra colonna si aggiorna il campo, con gli stessi permessi e regole della modifica.
 */
export function Board({ mod, config, owner, q }: { mod: Module; config: ViewConfig; owner: string; q: string }) {
  const board = BOARD_FIELDS[mod.name];
  const field = mod.fields.find((f) => f.name === board?.field);
  const amount = mod.fields.find((f) => f.name === board?.amount);
  const second = mod.fields.find((f) => f.inList && f.type === 'relation');
  const [data, setData] = useState<ViewPage | null>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState<string | null>(null);

  const load = () => {
    if (!field) return;
    const columns = [
      field.name,
      ...mod.labelFields,
      ...(amount ? [amount.name] : []),
      ...(second ? [second.name] : []),
    ];
    api<ViewPage>('/list-views/query', {
      method: 'POST',
      body: {
        module: mod.name,
        config: { ...config, columns: [...new Set(columns)] },
        q: q || undefined,
        owner: owner || undefined,
        pageSize: MAX_CARDS,
      },
    })
      .then(setData)
      .catch((e) => setError(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [mod.name, JSON.stringify(config), owner, q]);

  if (!field) return <p className="muted">Vista a colonne non disponibile per questo modulo.</p>;

  const values = [...(field.options.values ?? []), ''];
  const move = async (id: string, value: string) => {
    setError('');
    const prev = data;
    // aggiornamento immediato, annullato se il server rifiuta
    setData(
      (d) =>
        d && {
          ...d,
          items: d.items.map((r) => (r.id === id ? { ...r, data: { ...r.data, [field.name]: value || null } } : r)),
        },
    );
    try {
      await api(`/records/${mod.name}/${id}`, { method: 'PATCH', body: { data: { [field.name]: value || null } } });
    } catch (e) {
      setData(prev);
      setError((e as Error).message);
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {data && data.total > MAX_CARDS && (
        <p className="muted small">
          Sono mostrati i primi {MAX_CARDS} record su {data.total}: usa una vista o la ricerca per restringere.
        </p>
      )}
      <div className="board">
        {values.map((v) => {
          const cards = data?.items.filter((r) => (r.data[field.name] ?? '') === v) ?? [];
          if (v === '' && cards.length === 0) return null;
          const sum = amount ? cards.reduce((s, r) => s + (Number(r.data[amount.name]) || 0), 0) : 0;
          return (
            <div
              key={v || '-'}
              className={`board-col${over === v ? ' over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(v);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                const rec = data?.items.find((r) => r.id === id);
                if (rec && (rec.data[field.name] ?? '') !== v) move(id, v);
              }}
            >
              <h3>
                <span>
                  {v || '(senza valore)'} <span className="muted">({cards.length})</span>
                </span>
                {amount && sum > 0 && <span className="muted">{euro(sum)}</span>}
              </h3>
              <div className="board-cards">
                {cards.map((r) => (
                  <div
                    key={r.id}
                    className="board-card"
                    draggable={!!mod.permissions?.edit}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)}
                  >
                    <Link to={`/m/${mod.name}/${r.id}`}>{r.label || '(senza nome)'}</Link>
                    {second && r.data[second.name] != null && (
                      <div className="muted">
                        <FieldValue field={second} value={r.data[second.name]} refs={data!.refs} />
                      </div>
                    )}
                    {amount && r.data[amount.name] != null && (
                      <div>
                        <FieldValue field={amount} value={r.data[amount.name]} refs={data!.refs} />
                      </div>
                    )}
                    <div className="muted small">{data!.refs.users[r.ownerId]}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
