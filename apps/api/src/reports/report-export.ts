import { FieldType } from '../metadata/field-types';
import { NUMERIC_TYPES } from './report-config';
import { ReportResult } from './reports.service';

const TZ = 'Europe/Rome';
const numberFmt = new Intl.NumberFormat('it-IT', { useGrouping: false, maximumFractionDigits: 6 });
const dateTimeFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Valore di una cella come testo leggibile (nomi al posto degli id, date e numeri all'italiana). */
export function formatCell(type: FieldType, value: unknown, refs: ReportResult['refs']): string {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'user') return refs.users[String(value)] ?? '';
  if (type === 'relation') return refs.records[String(value)]?.label ?? '';
  if (type === 'boolean') return value === true || value === 'true' ? 'Sì' : 'No';
  if (type === 'multipicklist' && Array.isArray(value)) return value.join(', ');
  if (NUMERIC_TYPES.has(type)) return numberFmt.format(Number(value));
  if (type === 'date') return String(value).split('-').reverse().join('/');
  if (type === 'datetime') return dateTimeFmt.format(new Date(value as string)).replace(',', '');
  return String(value);
}

const cell = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const line = (cells: string[]) => cells.map(cell).join(';');

/**
 * CSV con separatore ";" e BOM UTF-8: Excel in italiano lo apre con le colonne già divise
 * e le lettere accentate corrette.
 */
export function toCsv(result: ReportResult, part: 'rows' | 'summary'): string {
  const out: string[] = [];
  if (part === 'summary' && result.groups && result.groupBy) {
    out.push(line([result.groupBy.label, 'Numero di record', ...result.totalDefs.map((t) => t.label)]));
    for (const g of result.groups) {
      out.push(
        line([
          g.label,
          String(g.count),
          ...result.totalDefs.map((t) => (g.totals[t.key] === null ? '' : numberFmt.format(g.totals[t.key]!))),
        ]),
      );
    }
    out.push(
      line([
        'Totale',
        String(result.totals.count),
        ...result.totalDefs.map((t) => (result.totals[t.key] == null ? '' : numberFmt.format(result.totals[t.key]!))),
      ]),
    );
  } else {
    out.push(line(result.columns.map((c) => c.label)));
    for (const r of result.rows) out.push(line(result.columns.map((c) => formatCell(c.type, r.values[c.key], result.refs))));
  }
  return '﻿' + out.join('\r\n') + '\r\n';
}

/** Nome di file sicuro a partire dal nome del rapporto. */
export function fileName(name: string, suffix = '') {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${base || 'rapporto'}${suffix}.csv`;
}
