import type { Field, Refs } from '../types';
import { RecordPicker } from './RecordPicker';

export function FieldInput({
  field,
  value,
  onChange,
  refs,
  users,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  refs?: Refs;
  users: { id: string; name: string }[];
}) {
  const disabled = field.editable === false;
  const str = value === null || value === undefined ? '' : String(value);
  const common = { id: `f-${field.name}`, disabled };

  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={4} value={str} onChange={(e) => onChange(e.target.value)} />;
    case 'boolean':
      return <input {...common} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return (
        <input
          {...common}
          type="number"
          step={field.type === 'integer' ? 1 : 'any'}
          value={str}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      );
    case 'date':
      return <input {...common} type="date" value={str} onChange={(e) => onChange(e.target.value || null)} />;
    case 'datetime':
      return (
        <input
          {...common}
          type="datetime-local"
          value={str ? str.slice(0, 16) : ''}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      );
    case 'email':
      return <input {...common} type="email" value={str} onChange={(e) => onChange(e.target.value)} />;
    case 'picklist':
      return (
        <select {...common} value={str} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {(field.options.values ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      );
    case 'multipicklist': {
      const sel = new Set((value as string[] | null) ?? []);
      return (
        <div className="checks">
          {(field.options.values ?? []).map((v) => (
            <label key={v}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={sel.has(v)}
                onChange={(e) => {
                  const next = new Set(sel);
                  if (e.target.checked) next.add(v);
                  else next.delete(v);
                  onChange([...next]);
                }}
              />
              {v}
            </label>
          ))}
        </div>
      );
    }
    case 'relation':
      return (
        <RecordPicker
          module={field.options.module!}
          value={(value as string) || null}
          initialLabel={value ? refs?.records[String(value)]?.label : undefined}
          disabled={disabled}
          onChange={(id) => onChange(id)}
        />
      );
    case 'user':
      return (
        <select {...common} value={str} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      );
    default:
      return <input {...common} type="text" value={str} onChange={(e) => onChange(e.target.value)} />;
  }
}
