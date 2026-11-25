import { z } from 'zod';
import { FieldType } from '../metadata/field-types';

/** Operatori dei filtri. "period" usa un periodo relativo alla data di oggi (vedi PERIODS). */
export const FILTER_OPS = ['eq', 'neq', 'contains', 'empty', 'notEmpty', 'gt', 'gte', 'lt', 'lte', 'period'] as const;
export const PERIODS = [
  'today',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
  'lastYear',
  'last7',
  'last30',
  'next30',
] as const;
export const AGGREGATES = ['sum', 'avg', 'min', 'max'] as const;
export const DATE_GROUPS = ['day', 'month', 'year'] as const;
export const CHARTS = ['none', 'bar', 'pie'] as const;

export type FilterOp = (typeof FILTER_OPS)[number];
export type Period = (typeof PERIODS)[number];
export type Aggregate = (typeof AGGREGATES)[number];

export const ReportConfigSchema = z.object({
  columns: z.array(z.string().min(1)).min(1, 'scegli almeno una colonna').max(30),
  filters: z
    .array(
      z.object({
        field: z.string().min(1),
        op: z.enum(FILTER_OPS),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
      }),
    )
    .max(20)
    .default([]),
  groupBy: z
    .object({ field: z.string().min(1), dateGroup: z.enum(DATE_GROUPS).optional() })
    .nullable()
    .optional(),
  /** ordine dei gruppi: per valore del gruppo o per numero di record (decrescente) */
  groupOrder: z.enum(['key', 'count']).default('key'),
  totals: z
    .array(z.object({ field: z.string().min(1), fn: z.enum(AGGREGATES) }))
    .max(12)
    .default([]),
  sort: z.object({ field: z.string().min(1), dir: z.enum(['asc', 'desc']) }).nullable().optional(),
  chart: z.enum(CHARTS).default('none'),
});
export type ReportConfig = z.infer<typeof ReportConfigSchema>;

export const ReportBodySchema = z.object({
  name: z.string().trim().min(1, 'obbligatorio').max(120),
  description: z.string().max(1000).default(''),
  module: z.string().min(1),
  shared: z.boolean().default(false),
  config: ReportConfigSchema,
});
export type ReportBody = z.infer<typeof ReportBodySchema>;

export const RunBodySchema = z.object({ module: z.string().min(1), config: ReportConfigSchema });

/** Colonne di sistema disponibili in ogni modulo, oltre ai campi. */
export const CORE_COLUMNS: Record<string, { label: string; type: FieldType }> = {
  ownerId: { label: 'Assegnato a', type: 'user' },
  createdAt: { label: 'Creato il', type: 'datetime' },
  updatedAt: { label: 'Modificato il', type: 'datetime' },
};

export const NUMERIC_TYPES = new Set<FieldType>(['integer', 'number', 'currency', 'percent']);
export const DATE_TYPES = new Set<FieldType>(['date', 'datetime']);
/** tipi su cui ha senso raggruppare */
export const GROUPABLE_TYPES = new Set<FieldType>([
  'text',
  'email',
  'phone',
  'url',
  'integer',
  'date',
  'datetime',
  'boolean',
  'picklist',
  'relation',
  'user',
]);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Intervallo [da, a) in date AAAA-MM-GG per un periodo relativo a "oggi". */
export function periodRange(period: Period, today = new Date()): [string, string] {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y = t.getFullYear();
  const m = t.getMonth();
  switch (period) {
    case 'today':
      return [iso(t), iso(addDays(t, 1))];
    case 'thisWeek': {
      const monday = addDays(t, -((t.getDay() + 6) % 7));
      return [iso(monday), iso(addDays(monday, 7))];
    }
    case 'thisMonth':
      return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 1))];
    case 'lastMonth':
      return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 1))];
    case 'thisQuarter': {
      const q = Math.floor(m / 3) * 3;
      return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 1))];
    }
    case 'thisYear':
      return [iso(new Date(y, 0, 1)), iso(new Date(y + 1, 0, 1))];
    case 'lastYear':
      return [iso(new Date(y - 1, 0, 1)), iso(new Date(y, 0, 1))];
    case 'last7':
      return [iso(addDays(t, -6)), iso(addDays(t, 1))];
    case 'last30':
      return [iso(addDays(t, -29)), iso(addDays(t, 1))];
    case 'next30':
      return [iso(t), iso(addDays(t, 30))];
  }
}
