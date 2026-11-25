import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import type { ListResult } from '../types';

/** Selettore di un record di un altro modulo con ricerca per nome. */
export function RecordPicker({
  module,
  value,
  initialLabel,
  onChange,
  disabled,
}: {
  module: string;
  value: string | null;
  initialLabel?: string;
  onChange: (id: string | null, label?: string) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [label, setLabel] = useState(initialLabel ?? '');

  useEffect(() => setLabel(initialLabel ?? ''), [initialLabel]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<ListResult>(`/records/${module}${qs({ q, pageSize: 10, sort: 'label', dir: 'asc' })}`)
        .then((r) => setItems(r.items.map((i) => ({ id: i.id, label: i.label }))))
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, module]);

  if (value && !open) {
    return (
      <div className="picker-selected">
        <span>{label || 'Selezionato'}</span>
        {!disabled && (
          <button type="button" className="link" onClick={() => onChange(null)}>
            rimuovi
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="picker">
      <input
        placeholder="Cerca…"
        value={q}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <ul className="picker-list">
          {items.length === 0 && <li className="muted">Nessun risultato</li>}
          {items.map((i) => (
            <li
              key={i.id}
              onMouseDown={() => {
                setLabel(i.label);
                onChange(i.id, i.label);
                setOpen(false);
                setQ('');
              }}
            >
              {i.label || '(senza nome)'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
