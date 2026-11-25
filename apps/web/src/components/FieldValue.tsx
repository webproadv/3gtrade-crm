import { Link } from 'react-router-dom';
import type { Field, Refs } from '../types';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from './format';

export function FieldValue({ field, value, refs }: { field: Field; value: unknown; refs?: Refs }) {
  if (value === undefined || value === null || value === '') return <span className="muted">—</span>;
  switch (field.type) {
    case 'currency':
      return <>{formatCurrency(Number(value))}</>;
    case 'integer':
    case 'number':
      return <>{formatNumber(Number(value))}</>;
    case 'percent':
      return <>{formatNumber(Number(value))}%</>;
    case 'date':
      return <>{formatDate(String(value))}</>;
    case 'datetime':
      return <>{formatDateTime(String(value))}</>;
    case 'boolean':
      return <>{value ? 'Sì' : 'No'}</>;
    case 'email':
      return <a href={`mailto:${value}`}>{String(value)}</a>;
    case 'phone':
      return <a href={`tel:${value}`}>{String(value)}</a>;
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noreferrer">
          {String(value).replace(/^https?:\/\//, '')}
        </a>
      );
    case 'multipicklist':
      return <>{(value as string[]).join(', ')}</>;
    case 'picklist':
      return <span className="tag">{String(value)}</span>;
    case 'relation': {
      const ref = refs?.records[String(value)];
      if (!ref) return <span className="muted">(non disponibile)</span>;
      return <Link to={`/m/${ref.module}/${value}`}>{ref.label || '(senza nome)'}</Link>;
    }
    case 'user':
      return <>{refs?.users[String(value)] ?? '—'}</>;
    case 'textarea':
      return <span className="pre">{String(value)}</span>;
    default:
      return <>{String(value)}</>;
  }
}
