import type { Aggregate, FieldType, FilterOp, Module } from '../../types';

export interface ColumnOption {
  key: string;
  label: string;
  type: FieldType;
  values?: string[];
  relModule?: string;
}

export const CORE_OPTIONS: ColumnOption[] = [
  { key: 'ownerId', label: 'Assegnato a', type: 'user' },
  { key: 'createdAt', label: 'Creato il', type: 'datetime' },
  { key: 'updatedAt', label: 'Modificato il', type: 'datetime' },
];

export function columnOptions(mod: Module | undefined): ColumnOption[] {
  if (!mod) return [];
  return [
    ...mod.fields.map((f) => ({
      key: f.name,
      label: f.label,
      type: f.type,
      values: f.options.values,
      relModule: f.options.module,
    })),
    ...CORE_OPTIONS,
  ];
}

export const NUMERIC = new Set<FieldType>(['integer', 'number', 'currency', 'percent']);
export const DATES = new Set<FieldType>(['date', 'datetime']);
const TEXT = new Set<FieldType>(['text', 'textarea', 'email', 'phone', 'url']);
export const GROUPABLE = new Set<FieldType>([
  'text', 'email', 'phone', 'url', 'integer', 'date', 'datetime', 'boolean', 'picklist', 'relation', 'user',
]);

export const OP_LABELS: Record<FilterOp, string> = {
  eq: 'uguale a',
  neq: 'diverso da',
  contains: 'contiene',
  empty: 'è vuoto',
  notEmpty: 'non è vuoto',
  gt: 'maggiore di',
  gte: 'maggiore o uguale a',
  lt: 'minore di',
  lte: 'minore o uguale a',
  period: 'nel periodo',
};
export const DATE_OP_LABELS: Partial<Record<FilterOp, string>> = {
  eq: 'il giorno',
  gte: 'dal giorno',
  lte: 'fino al giorno',
  gt: 'dopo il giorno',
  lt: 'prima del giorno',
};

export function opsFor(type: FieldType): FilterOp[] {
  if (TEXT.has(type)) return ['contains', 'eq', 'neq', 'empty', 'notEmpty'];
  if (NUMERIC.has(type)) return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty'];
  if (DATES.has(type)) return ['period', 'eq', 'gte', 'lte', 'gt', 'lt', 'empty', 'notEmpty'];
  if (type === 'multipicklist') return ['eq', 'neq', 'empty', 'notEmpty'];
  if (type === 'boolean') return ['eq'];
  return ['eq', 'neq', 'empty', 'notEmpty'];
}

export function opLabel(type: FieldType, op: FilterOp) {
  if (DATES.has(type) && DATE_OP_LABELS[op]) return DATE_OP_LABELS[op]!;
  if (type === 'multipicklist' && op === 'eq') return 'contiene';
  if (type === 'multipicklist' && op === 'neq') return 'non contiene';
  return OP_LABELS[op];
}

export const PERIOD_LABELS: Record<string, string> = {
  today: 'oggi',
  thisWeek: 'questa settimana',
  thisMonth: 'questo mese',
  lastMonth: 'il mese scorso',
  thisQuarter: 'questo trimestre',
  thisYear: "quest'anno",
  lastYear: "l'anno scorso",
  last7: 'ultimi 7 giorni',
  last30: 'ultimi 30 giorni',
  next30: 'prossimi 30 giorni',
};

export const AGG_LABELS: Record<Aggregate, string> = { sum: 'Somma', avg: 'Media', min: 'Minimo', max: 'Massimo' };
