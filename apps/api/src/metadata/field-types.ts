/**
 * Tipi di campo supportati dal motore metadata-driven e loro validazione.
 * I valori dei campi vengono salvati in records.data (JSONB) già normalizzati.
 */

export const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'url',
  'integer',
  'number',
  'currency',
  'percent',
  'date',
  'datetime',
  'boolean',
  'picklist',
  'multipicklist',
  'relation',
  'user',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldOptions {
  /** picklist / multipicklist */
  values?: string[];
  /** relation: modulo collegato */
  module?: string;
  /** text: lunghezza massima */
  maxLength?: number;
  /** valore proposto in creazione se il campo non viene indicato */
  default?: unknown;
}

export interface FieldDef {
  id: string;
  module: string;
  name: string;
  label: string;
  type: FieldType;
  block: string;
  required: boolean;
  isCustom: boolean;
  inList: boolean;
  sortOrder: number;
  options: FieldOptions;
}

export class FieldValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super('Dati non validi');
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Normalizza un singolo valore; restituisce [valore, errore]. null = campo svuotato. */
export function normalizeValue(field: FieldDef, raw: unknown): [unknown, string | undefined] {
  if (isEmpty(raw)) return [null, undefined];
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'phone': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return [null, 'deve essere un testo'];
      const s = String(raw).trim();
      const max = field.options.maxLength ?? (field.type === 'textarea' ? 20000 : 255);
      if (s.length > max) return [null, `massimo ${max} caratteri`];
      return [s, undefined];
    }
    case 'email': {
      const s = String(raw).trim().toLowerCase();
      return EMAIL_RE.test(s) ? [s, undefined] : [null, 'indirizzo email non valido'];
    }
    case 'url': {
      let s = String(raw).trim();
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      try {
        new URL(s);
        return [s, undefined];
      } catch {
        return [null, 'URL non valido'];
      }
    }
    case 'integer': {
      const n = toNumber(raw);
      return n !== undefined && Number.isInteger(n) ? [n, undefined] : [null, 'deve essere un numero intero'];
    }
    case 'number':
    case 'currency': {
      const n = toNumber(raw);
      if (n === undefined) return [null, 'deve essere un numero'];
      return [field.type === 'currency' ? Math.round(n * 100) / 100 : n, undefined];
    }
    case 'percent': {
      const n = toNumber(raw);
      if (n === undefined || n < 0 || n > 100) return [null, 'deve essere tra 0 e 100'];
      return [n, undefined];
    }
    case 'date': {
      const s = String(raw);
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return [null, 'data non valida (AAAA-MM-GG)'];
      return [s, undefined];
    }
    case 'datetime': {
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? [null, 'data/ora non valida'] : [d.toISOString(), undefined];
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return [raw, undefined];
      if (raw === 'true' || raw === '1' || raw === 1) return [true, undefined];
      if (raw === 'false' || raw === '0' || raw === 0) return [false, undefined];
      return [null, 'deve essere vero o falso'];
    }
    case 'picklist': {
      const s = String(raw);
      const values = field.options.values ?? [];
      return values.includes(s) ? [s, undefined] : [null, `valore non ammesso (${values.join(', ')})`];
    }
    case 'multipicklist': {
      if (!Array.isArray(raw)) return [null, 'deve essere un elenco'];
      const values = field.options.values ?? [];
      const bad = raw.filter((v) => !values.includes(String(v)));
      if (bad.length) return [null, `valori non ammessi: ${bad.join(', ')}`];
      return [Array.from(new Set(raw.map(String))), undefined];
    }
    case 'relation':
    case 'user':
      return isUuid(raw) ? [raw.toLowerCase(), undefined] : [null, 'riferimento non valido'];
    default:
      return [null, 'tipo di campo sconosciuto'];
  }
}

export interface ValidateOptions {
  /** true in creazione: i campi obbligatori devono essere presenti */
  isCreate: boolean;
  /** nomi dei campi che l'utente può modificare */
  editable: Set<string>;
}

/**
 * Valida e normalizza un payload rispetto ai metadati dei campi.
 * Restituisce solo i campi presenti nel payload (patch), già normalizzati.
 */
export function validateRecordData(
  fields: FieldDef[],
  input: Record<string, unknown>,
  opts: ValidateOptions,
): Record<string, unknown> {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    const field = byName.get(key);
    if (!field) {
      errors[key] = 'campo inesistente';
      continue;
    }
    if (!opts.editable.has(key)) {
      errors[key] = 'campo non modificabile';
      continue;
    }
    const [value, err] = normalizeValue(field, raw);
    if (err) errors[key] = err;
    else if (value === null && field.required) errors[key] = 'campo obbligatorio';
    else out[key] = value;
  }

  if (opts.isCreate) {
    for (const f of fields) {
      if (f.required && isEmpty(input[f.name]) && !errors[f.name]) errors[f.name] = 'campo obbligatorio';
    }
  }

  if (Object.keys(errors).length) throw new FieldValidationError(errors);
  return out;
}

/** Nome tecnico per un campo personalizzato, es. "Codice SDI" -> "cf_codice_sdi". */
export function customFieldName(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `cf_${slug || 'campo'}`;
}

/** Calcola l'etichetta visualizzata di un record dai campi "label". */
export function computeLabel(labelFields: string[], data: Record<string, unknown>): string {
  return labelFields
    .map((f) => data[f])
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(String)
    .join(' ')
    .trim();
}
